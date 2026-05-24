import { randomUUID } from "node:crypto";

import {
  TelnyxGovernedCommunicationsError,
  sanitizeGovernedValue
} from "./telnyxClient.js";
import type {
  CallStatusInput,
  CallTimelineInput,
  GovernedCommunicationsClient,
  MessageStatusInput,
  NormalizedErrorClass,
  NormalizedOutcome,
  PageInput,
  PolicyConfig,
  SendMessageInput,
  StartCallInput,
  StartVerificationInput,
  VerificationStatusInput,
  VerifyChannel
} from "./types.js";

const DEFAULT_MAX_MEDIA_URLS = 3;
const DEFAULT_MAX_PAGE_SIZE = 50;
const DEFAULT_MAX_TIMELINE_WINDOW_HOURS = 72;
const DEFAULT_IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;
const DEFAULT_POLICY_TAG = "governed_communications";

type IdempotencyRecord = { expiresAtMs: number; result: Record<string, unknown> };
type IdempotencyStore = Map<string, IdempotencyRecord>;

export interface GovernedCommunicationsServiceOptions {
  now?: () => Date;
  idempotencyStore?: IdempotencyStore;
  policy?: Partial<PolicyConfig>;
}

export function createGovernedCommunicationsService(
  client: GovernedCommunicationsClient,
  options: GovernedCommunicationsServiceOptions = {}
) {
  const now = options.now ?? (() => new Date());
  const policy = buildPolicyConfig(options.policy);
  const idempotencyStore = options.idempotencyStore ?? new Map<string, IdempotencyRecord>();

  return {
    policy,

    async listOwnedSenders() {
      const page = normalizePage({}, policy.maxPageSize);
      const [phoneNumbersEnvelope, messagingProfilesEnvelope, connectionsEnvelope] = await Promise.all([
        client.listPhoneNumbers(page),
        client.listMessagingProfiles(page),
        client.listCallControlApplications(page)
      ]);

      const phone_numbers = filterAllowedPhoneNumbers(dataArray(phoneNumbersEnvelope), policy.messageSenders, policy.callFromNumbers);
      const messaging_profiles = filterAllowedIds(dataArray(messagingProfilesEnvelope), policy.messagingProfiles);
      const call_connections = filterAllowedIds(dataArray(connectionsEnvelope), policy.callConnections);

      return normalizeReadResult("ok", {
        allowed_senders: { phone_numbers, messaging_profiles, call_connections },
        allowlists: {
          message_senders: [...policy.messageSenders],
          messaging_profiles: [...policy.messagingProfiles],
          call_from_numbers: [...policy.callFromNumbers],
          call_connections: [...policy.callConnections],
          verify_profiles: [...policy.verifyProfiles],
          verify_channels: [...policy.verifyChannels]
        }
      });
    },

    async getMessageStatus(input: MessageStatusInput) {
      const messageId = requireNonBlank(input.message_id, "message_id is required.");
      return normalizeReadResult("ok", await client.getMessageStatus(messageId));
    },

    async getCallStatus(input: CallStatusInput) {
      const callControlId = requireNonBlank(input.call_control_id, "call_control_id is required.");
      return normalizeReadResult("ok", await client.getCallStatus(callControlId));
    },

    async getCallTimeline(input: CallTimelineInput) {
      const page = normalizePage(input, policy.maxPageSize);
      const start = parseIso(input.occurred_at_gte, "occurred_at_gte must be an ISO timestamp when provided.");
      const end = parseIso(input.occurred_at_lte, "occurred_at_lte must be an ISO timestamp when provided.");
      if (start && end && end.getTime() < start.getTime()) {
        throw createGovernedError("validation", "occurred_at_lte must be greater than or equal to occurred_at_gte.");
      }
      if (start && end) {
        const maxWindowMs = policy.maxTimelineWindowHours * 60 * 60 * 1000;
        if (end.getTime() - start.getTime() > maxWindowMs) {
          throw createGovernedError(
            "validation",
            `Timeline windows are capped at ${policy.maxTimelineWindowHours} hours for governed reads.`
          );
        }
      }

      const filters: Record<string, unknown> = {
        "filter[leg_id]": normalizeOptional(input.call_leg_id),
        "filter[application_session_id]": normalizeOptional(input.application_session_id ?? input.call_session_id),
        "filter[connection_id]": normalizeOptional(input.connection_id),
        "filter[occurred_at][gte]": input.occurred_at_gte,
        "filter[occurred_at][lte]": input.occurred_at_lte,
        "page[number]": page.pageNumber,
        "page[size]": page.pageSize
      };
      return normalizeReadResult("ok", await client.getCallTimeline(filters));
    },

    async getVerificationStatus(input: VerificationStatusInput) {
      const verificationId = requireNonBlank(input.verification_id, "verification_id is required.");
      return normalizeReadResult("ok", await client.getVerificationStatus(verificationId));
    },

    async sendMessage(input: SendMessageInput) {
      const sender = requireNonBlank(input.sender, "sender is required.");
      const destination = requireNonBlank(input.destination, "destination is required.");
      const text = requireNonBlank(input.text, "text is required.");
      const idempotencyKey = requireNonBlank(input.idempotency_key, "idempotency_key is required.");
      assertAllowed(policy.messageSenders, sender, "sender");
      const messagingProfileId = normalizeOptional(input.messaging_profile_id);
      if (messagingProfileId) assertAllowed(policy.messagingProfiles, messagingProfileId, "messaging_profile_id");
      const mediaUrls = normalizeMediaUrls(input.media_urls, policy.maxMediaUrls);
      const request = {
        from: sender,
        to: destination,
        text,
        ...(messagingProfileId ? { messaging_profile_id: messagingProfileId } : {}),
        ...(mediaUrls.length > 0 ? { media_urls: mediaUrls } : {})
      };

      return executeMutation({
        toolName: "communications_send_message",
        idempotencyKey,
        policyTag: normalizePolicyTag(input.policy_tag, policy.defaultPolicyTag),
        requestSummary: request,
        execute: async () => client.sendMessage(request, idempotencyKey),
        store: idempotencyStore,
        ttlMs: policy.idempotencyTtlMs,
        now
      });
    },

    async startCall(input: StartCallInput) {
      const from = requireNonBlank(input.from, "from is required.");
      const to = requireNonBlank(input.to, "to is required.");
      const connectionId = requireNonBlank(input.connection_id, "connection_id is required.");
      const webhookUrl = requireNonBlank(input.webhook_url, "webhook_url is required.");
      const idempotencyKey = requireNonBlank(input.idempotency_key, "idempotency_key is required.");
      assertAllowed(policy.callFromNumbers, from, "from");
      assertAllowed(policy.callConnections, connectionId, "connection_id");

      const request = {
        connection_id: connectionId,
        from,
        to,
        webhook_url: webhookUrl,
        ...(input.timeout_secs !== undefined ? { timeout_secs: input.timeout_secs } : {})
      };

      return executeMutation({
        toolName: "communications_start_call",
        idempotencyKey,
        policyTag: normalizePolicyTag(input.policy_tag, policy.defaultPolicyTag),
        requestSummary: request,
        execute: async () => client.startCall(request, idempotencyKey),
        store: idempotencyStore,
        ttlMs: policy.idempotencyTtlMs,
        now
      });
    },

    async startVerification(input: StartVerificationInput) {
      const destination = requireNonBlank(input.destination, "destination is required.");
      const verifyProfileId = requireNonBlank(input.verify_profile_id, "verify_profile_id is required.");
      const channel = input.channel;
      const idempotencyKey = requireNonBlank(input.idempotency_key, "idempotency_key is required.");
      assertAllowed(policy.verifyProfiles, verifyProfileId, "verify_profile_id");
      if (!policy.verifyChannels.has(channel)) {
        throw createGovernedError("policy_denied", `channel ${channel} is not in the configured verify-channel allowlist.`);
      }
      const request = {
        phone_number: destination,
        verify_profile_id: verifyProfileId,
        ...(input.timeout_secs !== undefined ? { timeout_secs: input.timeout_secs } : {}),
        ...(normalizeOptional(input.locale) ? { locale: input.locale } : {}),
        ...(normalizeOptional(input.custom_code) ? { custom_code: input.custom_code } : {})
      };

      return executeMutation({
        toolName: "communications_start_verification",
        idempotencyKey,
        policyTag: normalizePolicyTag(input.policy_tag, policy.defaultPolicyTag),
        requestSummary: { ...request, channel },
        execute: async () => client.startVerification(channel, request, idempotencyKey),
        store: idempotencyStore,
        ttlMs: policy.idempotencyTtlMs,
        now
      });
    }
  };
}

export type GovernedCommunicationsService = ReturnType<typeof createGovernedCommunicationsService>;

export function buildPolicyConfig(overrides: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    messageSenders: overrides.messageSenders ?? csvSet(process.env.COMMUNICATIONS_ALLOWED_MESSAGE_SENDERS),
    messagingProfiles: overrides.messagingProfiles ?? csvSet(process.env.COMMUNICATIONS_ALLOWED_MESSAGING_PROFILES),
    callFromNumbers: overrides.callFromNumbers ?? csvSet(process.env.COMMUNICATIONS_ALLOWED_CALL_FROM_NUMBERS),
    callConnections: overrides.callConnections ?? csvSet(process.env.COMMUNICATIONS_ALLOWED_CALL_CONNECTIONS),
    verifyProfiles: overrides.verifyProfiles ?? csvSet(process.env.COMMUNICATIONS_ALLOWED_VERIFY_PROFILES),
    verifyChannels:
      overrides.verifyChannels ??
      new Set<VerifyChannel>(csvArray(process.env.COMMUNICATIONS_ALLOWED_VERIFY_CHANNELS).filter(isVerifyChannel)),
    defaultPolicyTag: overrides.defaultPolicyTag ?? (normalizeOptional(process.env.COMMUNICATIONS_DEFAULT_POLICY_TAG) ?? DEFAULT_POLICY_TAG),
    maxMediaUrls: overrides.maxMediaUrls ?? positiveInt(process.env.COMMUNICATIONS_MAX_MEDIA_URLS, DEFAULT_MAX_MEDIA_URLS),
    maxPageSize: overrides.maxPageSize ?? positiveInt(process.env.COMMUNICATIONS_MAX_PAGE_SIZE, DEFAULT_MAX_PAGE_SIZE),
    maxTimelineWindowHours:
      overrides.maxTimelineWindowHours ??
      positiveInt(process.env.COMMUNICATIONS_MAX_TIMELINE_WINDOW_HOURS, DEFAULT_MAX_TIMELINE_WINDOW_HOURS),
    idempotencyTtlMs:
      overrides.idempotencyTtlMs ?? positiveInt(process.env.COMMUNICATIONS_IDEMPOTENCY_TTL_MS, DEFAULT_IDEMPOTENCY_TTL_MS)
  };
}

function csvArray(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function csvSet(value: string | undefined): Set<string> {
  return new Set(csvArray(value));
}

function isVerifyChannel(value: string): value is VerifyChannel {
  return value === "sms" || value === "call" || value === "flashcall";
}

function positiveInt(value: string | number | undefined, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function dataArray(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  const data = (value as { data?: unknown }).data;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function filterAllowedPhoneNumbers(
  values: Record<string, unknown>[],
  messageSenders: Set<string>,
  callFromNumbers: Set<string>
) {
  const allow = new Set([...messageSenders, ...callFromNumbers]);
  return values.filter((item) => {
    const candidate = normalizeOptional(String(item.phone_number ?? item.number ?? ""));
    return candidate ? allow.has(candidate) : false;
  });
}

function filterAllowedIds(values: Record<string, unknown>[], allowlist: Set<string>) {
  return values.filter((item) => {
    const candidate = normalizeOptional(String(item.id ?? item.connection_id ?? ""));
    return candidate ? allowlist.has(candidate) : false;
  });
}

function normalizePage(input: PageInput, maxPageSize: number) {
  const pageNumber = positiveInt(input.pageNumber ?? input.page_number, 1);
  const pageSize = Math.min(positiveInt(input.pageSize ?? input.page_size, maxPageSize), maxPageSize);
  return { pageNumber, pageSize };
}

function requireNonBlank(value: string | undefined, message: string): string {
  const normalized = normalizeOptional(value);
  if (!normalized) throw createGovernedError("validation", message);
  return normalized;
}

function normalizeOptional(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMediaUrls(values: string[] | undefined, maxMediaUrls: number): string[] {
  const urls = Array.isArray(values)
    ? values.map((entry) => entry.trim()).filter(Boolean)
    : [];
  if (urls.length > maxMediaUrls) {
    throw createGovernedError("validation", `media_urls is capped at ${maxMediaUrls} entries.`);
  }
  return urls;
}

function assertAllowed(allowlist: Set<string>, value: string, field: string): void {
  if (!allowlist.has(value)) {
    throw createGovernedError("policy_denied", `${field} ${value} is not in the configured allowlist.`);
  }
}

function parseIso(value: string | undefined, message: string): Date | undefined {
  const normalized = normalizeOptional(value);
  if (!normalized) return undefined;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw createGovernedError("validation", message);
  }
  return date;
}

function normalizePolicyTag(value: string | undefined, defaultPolicyTag: string): string {
  return normalizeOptional(value) ?? defaultPolicyTag;
}

function normalizeReadResult(status: NormalizedOutcome["status"], result: unknown) {
  return {
    tool_invocation_id: randomUUID(),
    outcome: { status, replayed: false, retriable: false },
    result: sanitizeGovernedValue(result)
  };
}

async function executeMutation(args: {
  toolName: string;
  idempotencyKey: string;
  policyTag: string;
  requestSummary: Record<string, unknown>;
  execute: () => Promise<unknown>;
  store: IdempotencyStore;
  ttlMs: number;
  now: () => Date;
}) {
  evictExpired(args.store, args.now().getTime());
  const storeKey = `${args.toolName}:${args.idempotencyKey}`;
  const existing = args.store.get(storeKey);
  if (existing) {
    return {
      ...existing.result,
      outcome: { status: "replayed", replayed: true, retriable: false }
    };
  }

  const tool_invocation_id = randomUUID();
  const executedAt = args.now().toISOString();
  const result = sanitizeGovernedValue(await args.execute());
  const payload = {
    tool_invocation_id,
    outcome: { status: "executed", replayed: false, retriable: false },
    policy: { tag: args.policyTag },
    executed_at: executedAt,
    request: sanitizeGovernedValue(args.requestSummary),
    result
  } satisfies Record<string, unknown>;
  args.store.set(storeKey, { expiresAtMs: args.now().getTime() + args.ttlMs, result: payload });
  return payload;
}

function evictExpired(store: IdempotencyStore, nowMs: number): void {
  for (const [key, value] of store.entries()) {
    if (value.expiresAtMs <= nowMs) store.delete(key);
  }
}

export function createGovernedError(errorClass: NormalizedErrorClass, message: string, details?: unknown) {
  const error = new Error(message) as Error & {
    governedErrorClass?: NormalizedErrorClass;
    governedDetails?: unknown;
  };
  error.name = "GovernedCommunicationsError";
  error.governedErrorClass = errorClass;
  error.governedDetails = details;
  return error;
}

export function normalizeToolError(error: unknown): { error_class: NormalizedErrorClass; retriable: boolean; message: string; details?: unknown } {
  if (error && typeof error === "object" && "governedErrorClass" in error) {
    const typed = error as Error & { governedErrorClass?: NormalizedErrorClass; governedDetails?: unknown };
    return {
      error_class: typed.governedErrorClass ?? "validation",
      retriable: typed.governedErrorClass === "rate_limited" || typed.governedErrorClass === "upstream_transient",
      message: typed.message,
      details: sanitizeGovernedValue(typed.governedDetails)
    };
  }

  if (error instanceof TelnyxGovernedCommunicationsError) {
    const error_class = classifyStatus(error.status);
    return {
      error_class,
      retriable: error_class === "rate_limited" || error_class === "upstream_transient",
      message: error.message,
      details: sanitizeGovernedValue(error.details)
    };
  }

  const fallback = error instanceof Error ? error : new Error(String(error));
  return {
    error_class: "upstream_terminal",
    retriable: false,
    message: fallback.message
  };
}

function classifyStatus(status: number): NormalizedErrorClass {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_transient";
  return "upstream_terminal";
}
