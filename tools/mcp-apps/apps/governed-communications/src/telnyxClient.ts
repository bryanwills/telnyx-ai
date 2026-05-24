import type {
  GovernedCommunicationsClient,
  PageInput,
  TelnyxClientOptions,
  TelnyxEnvelope,
  VerifyChannel
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.telnyx.com/v2";
const OPERATIONAL_ID_KEYS = new Set([
  "id",
  "message_id",
  "call_control_id",
  "call_leg_id",
  "call_session_id",
  "application_session_id",
  "connection_id",
  "messaging_profile_id",
  "verify_profile_id",
  "verification_id",
  "phone_number_id"
]);

export class TelnyxGovernedCommunicationsError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "TelnyxGovernedCommunicationsError";
    this.status = status;
    this.details = details;
  }
}

export class TelnyxGovernedCommunicationsClient implements GovernedCommunicationsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TelnyxClientOptions) {
    if (!options.apiKey) throw new Error("Telnyx API key is required for live governed communications calls");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new Error("A fetch implementation is required");
  }

  async listPhoneNumbers(input: PageInput = {}): Promise<TelnyxEnvelope<Record<string, unknown>[]>> {
    const url = this.url("/phone_numbers");
    addPaging(url, input);
    return this.request(url, { method: "GET" });
  }

  async listMessagingProfiles(input: PageInput = {}): Promise<TelnyxEnvelope<Record<string, unknown>[]>> {
    const url = this.url("/messaging_profiles");
    addPaging(url, input);
    return this.request(url, { method: "GET" });
  }

  async listCallControlApplications(input: PageInput = {}): Promise<TelnyxEnvelope<Record<string, unknown>[]>> {
    const url = this.url("/call_control_applications");
    addPaging(url, input);
    return this.request(url, { method: "GET" });
  }

  async sendMessage(payload: Record<string, unknown>, idempotencyKey: string): Promise<TelnyxEnvelope> {
    return this.request(this.url("/messages"), {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload)
    });
  }

  async getMessageStatus(messageId: string): Promise<TelnyxEnvelope> {
    return this.request(this.url(`/messages/${encodeURIComponent(messageId)}`), { method: "GET" });
  }

  async startCall(payload: Record<string, unknown>, idempotencyKey: string): Promise<TelnyxEnvelope> {
    return this.request(this.url("/calls"), {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload)
    });
  }

  async getCallStatus(callControlId: string): Promise<TelnyxEnvelope> {
    return this.request(this.url(`/calls/${encodeURIComponent(callControlId)}`), { method: "GET" });
  }

  async getCallTimeline(filters: Record<string, unknown>): Promise<TelnyxEnvelope> {
    const url = this.url("/call_events");
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.append(key, String(value));
    }
    return this.request(url, { method: "GET" });
  }

  async startVerification(channel: VerifyChannel, payload: Record<string, unknown>, idempotencyKey: string): Promise<TelnyxEnvelope> {
    return this.request(this.url(`/verifications/${encodeURIComponent(channel)}`), {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload)
    });
  }

  async getVerificationStatus(verificationId: string): Promise<TelnyxEnvelope> {
    return this.request(this.url(`/verifications/${encodeURIComponent(verificationId)}`), { method: "GET" });
  }

  private url(path: string): URL {
    return new URL(`${this.baseUrl}${path}`);
  }

  private async request<T>(url: URL, init: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined)
    };
    const response = await this.fetchImpl(url.toString(), { ...init, headers });
    const body = await parseJson(response);
    if (!response.ok) {
      const sanitizedDetails = sanitizeGovernedValue(body);
      throw new TelnyxGovernedCommunicationsError(
        sanitizeGovernedMessage(extractTelnyxErrorMessage(sanitizedDetails) ?? `Telnyx request failed with status ${response.status}`),
        response.status,
        sanitizedDetails
      );
    }
    return body as T;
  }
}

function addPaging(url: URL, input: PageInput): void {
  if (input.pageNumber !== undefined) url.searchParams.set("page[number]", String(input.pageNumber));
  if (input.pageSize !== undefined) url.searchParams.set("page[size]", String(input.pageSize));
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function extractTelnyxErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  const first = errors[0];
  if (!first || typeof first !== "object") return undefined;
  const title = (first as { title?: unknown }).title;
  const detail = (first as { detail?: unknown }).detail;
  return [title, detail].filter((value): value is string => typeof value === "string" && value.length > 0).join(": ");
}

export function sanitizeGovernedError(error: unknown): Error {
  const source = error instanceof Error ? error : new Error(String(error));
  const sanitized = new Error(sanitizeGovernedMessage(source.message));
  sanitized.name = source.name;
  return sanitized;
}

export function sanitizeGovernedValue(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((nested) => sanitizeGovernedValue(nested, key));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      if (isMessageBodyKey(nestedKey)) output[nestedKey] = "[redacted-message-body]";
      else if (isVerificationSecretKey(nestedKey)) output[nestedKey] = "[redacted-verification-secret]";
      else if (isMediaUrlKey(nestedKey)) output[nestedKey] = "[redacted-media-url]";
      else if (isUrlKey(nestedKey)) output[nestedKey] = "[redacted-url]";
      else if (isSecretKey(nestedKey)) output[nestedKey] = "[redacted-secret]";
      else output[nestedKey] = sanitizeGovernedValue(nestedValue, nestedKey);
    }
    return output;
  }
  if (typeof value === "string") {
    if (OPERATIONAL_ID_KEYS.has(key)) return sanitizeGovernedMessage(value, false, false);
    if (isPhoneKey(key)) return redactPhoneNumbers(sanitizeGovernedMessage(value));
    if (isUrlLikeValue(value) && !OPERATIONAL_ID_KEYS.has(key)) return "[redacted-url]";
    return sanitizeGovernedMessage(value);
  }
  return value;
}

function sanitizeGovernedMessage(text: string, redactPhones = true, redactUrls = true): string {
  let output = text.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted-secret]");
  if (redactPhones) output = redactPhoneNumbers(output);
  if (redactUrls) output = output.replace(/https?:\/\/[^\s"]+/g, "[redacted-url]");
  return output;
}

function redactPhoneNumbers(value: string): string {
  return value.replace(/\+?[1-9]\d{7,14}/g, "[redacted-phone]");
}

function isPhoneKey(key: string): boolean {
  return /(phone|from|to|destination|sender)/i.test(key);
}

function isSecretKey(key: string): boolean {
  return /(authorization|api[_-]?key|token|password|secret|credential)/i.test(key);
}

function isMessageBodyKey(key: string): boolean {
  return /(^text$|body|message)/i.test(key);
}

function isVerificationSecretKey(key: string): boolean {
  return /(code|pin)/i.test(key);
}

function isMediaUrlKey(key: string): boolean {
  return /(media.*url|media_urls)/i.test(key);
}

function isUrlKey(key: string): boolean {
  return /(url|uri|href)/i.test(key);
}

function isUrlLikeValue(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
