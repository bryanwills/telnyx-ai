import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { AuditLogger } from "./types.js";

const messageGatewayMetricsStartedAt = Date.now();
let messageGatewayHttpRequestsTotal = 0;

export type MessageGatewayTransport = "auto" | "slack" | "google_chat" | "a2a";
export type MessageGatewayChosenTransport = Exclude<MessageGatewayTransport, "auto">;
export type MessageGatewayDeliveryStatus = "queued" | "delivered" | "retryable_failure" | "failed" | "rejected";
export type MessageGatewayStatus = "accepted" | "partial" | "delivered" | "failed" | "rejected";
export type MessageGatewayEventType =
  | "message.accepted"
  | "message.idempotent_replay"
  | "delivery.queued"
  | "delivery.delivered"
  | "delivery.retryable_failure"
  | "delivery.failed"
  | "delivery.rejected"
  | "provider.reply"
  | "provider.delivery_event";

export interface MessageGatewayReadinessCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface MessageGatewayReadiness {
  ready: boolean;
  service: "link-message-gateway";
  storage: {
    configured: boolean;
    path?: string;
    retention: "delivery-ledger";
  };
  adapters: Record<MessageGatewayChosenTransport, {
    configured: boolean;
    mode: string;
  }>;
  checks: MessageGatewayReadinessCheck[];
}

export interface MessageGatewayHttpOptions {
  requireAuth?: boolean;
  requireAuthContext?: boolean;
}

export interface MessageGatewayActor {
  id: string;
  displayName?: string;
  email?: string;
}

export interface MessageGatewayInput {
  from?: unknown;
  to?: unknown;
  body?: unknown;
  subject?: unknown;
  metadata?: unknown;
  idempotency_key?: unknown;
  idempotencyKey?: unknown;
  transport?: unknown;
}

export interface MessageGatewayPerson {
  email: string;
  displayName?: string;
  active: boolean;
  slackUserId?: string;
  googleChatUser?: string;
  preferredTransport?: MessageGatewayChosenTransport;
}

export interface MessageGatewayGroup {
  alias: string;
  members: string[];
}

export interface MessageGatewayAgent {
  id: string;
  displayName?: string;
  active: boolean;
  endpoint?: string;
}

export interface MessageGatewayDirectory {
  people?: MessageGatewayPerson[];
  groups?: MessageGatewayGroup[];
  agents?: MessageGatewayAgent[];
}

export interface MessageGatewayProviderResult {
  externalId: string;
  externalUrl?: string;
  taskId?: string;
  contextId?: string;
  retryable?: boolean;
  status?: Extract<MessageGatewayDeliveryStatus, "delivered" | "retryable_failure" | "failed">;
  metadata?: Record<string, unknown>;
}

export interface MessageGatewayAdapter {
  readonly mode?: string;
  send(request: MessageGatewayAdapterSendRequest): Promise<MessageGatewayProviderResult>;
  checkReadiness?(): MessageGatewayReadinessCheck[];
}

export interface MessageGatewayAdapterSendRequest {
  message: MessageGatewayMessage;
  delivery: MessageGatewayDelivery;
  renderedBody: string;
}

export interface MessageGatewayServiceOptions {
  auditLogger?: AuditLogger;
  idGenerator?: () => string;
  now?: () => Date;
  storagePath?: string;
  bodyRetentionMs?: number;
  directory?: MessageGatewayDirectory;
  adapters?: Partial<Record<MessageGatewayChosenTransport, MessageGatewayAdapter>>;
}

export interface MessageGatewayMessage {
  id: string;
  from: MessageGatewayActor;
  to: string[];
  body?: string;
  bodyRedactedAt?: string;
  subject?: string;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
  transportHint: MessageGatewayTransport;
  status: MessageGatewayStatus;
  deliveries: MessageGatewayDelivery[];
  retryCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageGatewayDelivery {
  id: string;
  recipient: string;
  recipientType: "person" | "agent";
  transport: MessageGatewayChosenTransport;
  status: MessageGatewayDeliveryStatus;
  routeReason: string;
  providerRecipientId?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  providerUrl?: string;
  taskId?: string;
  contextId?: string;
  retryCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface MessageGatewayEvent {
  id: string;
  messageId: string;
  deliveryId?: string;
  type: MessageGatewayEventType;
  transport?: MessageGatewayChosenTransport;
  providerEventId?: string;
  detail: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface StoredMessageGatewayLedger {
  messages?: unknown;
  events?: unknown;
  idempotency?: unknown;
}

interface RouteResult {
  delivery?: MessageGatewayDelivery;
  event?: MessageGatewayEvent;
}

export class MessageGatewayService {
  private readonly messages = new Map<string, MessageGatewayMessage>();
  private readonly events: MessageGatewayEvent[] = [];
  private readonly idempotency = new Map<string, string>();
  private readonly auditLogger?: AuditLogger;
  private readonly idGenerator: () => string;
  private readonly now: () => Date;
  private readonly storagePath?: string;
  private readonly bodyRetentionMs: number;
  private readonly people = new Map<string, MessageGatewayPerson>();
  private readonly groups = new Map<string, MessageGatewayGroup>();
  private readonly agents = new Map<string, MessageGatewayAgent>();
  private readonly adapters: Record<MessageGatewayChosenTransport, MessageGatewayAdapter>;

  constructor(options: MessageGatewayServiceOptions = {}) {
    this.auditLogger = options.auditLogger;
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.storagePath = options.storagePath;
    this.bodyRetentionMs = options.bodyRetentionMs ?? 24 * 60 * 60 * 1000;
    this.adapters = {
      slack: options.adapters?.slack ?? new RecordOnlyMessageGatewayAdapter("slack"),
      google_chat: options.adapters?.google_chat ?? new RecordOnlyMessageGatewayAdapter("google_chat"),
      a2a: options.adapters?.a2a ?? new RecordOnlyMessageGatewayAdapter("a2a"),
    };
    this.loadDirectory(options.directory ?? defaultMessageGatewayDirectory());
    const stored = this.loadStoredLedger();
    for (const message of stored.messages) this.messages.set(message.id, message);
    this.events.push(...stored.events);
    for (const [key, messageId] of stored.idempotency) this.idempotency.set(key, messageId);
    this.redactExpiredBodies();
  }

  readiness(): MessageGatewayReadiness {
    const adapterChecks = Object.entries(this.adapters).flatMap(([transport, adapter]) => (
      adapter.checkReadiness?.() ?? [{
        name: `${transport} adapter configured`,
        ok: true,
        detail: `${adapter.mode ?? "record-only"} adapter is available`,
      }]
    ));
    const checks = [
      {
        name: "Gateway ledger storage configured",
        ok: Boolean(this.storagePath),
        detail: this.storagePath ? "persistent delivery ledger path configured" : "LINK_MESSAGE_GATEWAY_STORAGE or --storage is required for production",
      },
      {
        name: "Directory has active Telnyx users",
        ok: [...this.people.values()].some((person) => person.active && person.email.endsWith("@telnyx.com")),
        detail: "active @telnyx.com directory entries are required for human routing",
      },
      ...adapterChecks,
    ];
    return {
      ready: checks.every((check) => check.ok),
      service: "link-message-gateway",
      storage: {
        configured: Boolean(this.storagePath),
        path: this.storagePath,
        retention: "delivery-ledger",
      },
      adapters: {
        slack: { configured: true, mode: this.adapters.slack.mode ?? "custom" },
        google_chat: { configured: true, mode: this.adapters.google_chat.mode ?? "custom" },
        a2a: { configured: true, mode: this.adapters.a2a.mode ?? "custom" },
      },
      checks,
    };
  }

  async createMessage(input: MessageGatewayInput = {}, actor: string | MessageGatewayActor = "", transportHeader = ""): Promise<MessageGatewayMessage> {
    this.redactExpiredBodies();
    const normalizedActor = normalizeActor(input.from || actor);
    const recipients = normalizeRecipients(input.to);
    const body = normalizeOptionalString(input.body);
    if (recipients.length === 0) throw new Error("to must include at least one recipient.");
    if (!body) throw new Error("body is required.");

    const idempotencyKey = normalizeOptionalString(input.idempotency_key ?? input.idempotencyKey);
    if (!idempotencyKey) throw new Error("idempotency_key is required.");
    const scopedIdempotencyKey = `${normalizedActor.id}:${idempotencyKey}`;
    const existingId = this.idempotency.get(scopedIdempotencyKey);
    if (existingId) {
      const existing = this.messages.get(existingId);
      if (existing) {
        this.events.push(this.event(existing.id, "message.idempotent_replay", "Duplicate idempotency_key returned the original gateway message."));
        this.persistLedger();
        return existing;
      }
    }

    const now = this.timestamp();
    const transportHint = normalizeTransport(input.transport ?? transportHeader);
    const message: MessageGatewayMessage = {
      id: `msg-${this.idGenerator()}`,
      from: normalizedActor,
      to: recipients,
      body,
      subject: normalizeOptionalString(input.subject) || undefined,
      metadata: normalizeMetadata(input.metadata),
      idempotencyKey,
      transportHint,
      status: "accepted",
      deliveries: [],
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const routes = recipients.flatMap((recipient) => this.resolveRecipientRoutes(message, recipient));
    message.deliveries = routes.map((route) => route.delivery).filter((delivery): delivery is MessageGatewayDelivery => Boolean(delivery));
    this.messages.set(message.id, message);
    this.idempotency.set(scopedIdempotencyKey, message.id);
    this.events.push(this.event(message.id, "message.accepted", "Message envelope accepted by Cloud Link Message Gateway.", {
      transportHint,
      recipients,
    }));
    for (const route of routes) {
      if (route.event) this.events.push(route.event);
    }

    if (message.deliveries.length === 0) {
      message.status = "rejected";
      message.lastError = "No deliverable recipients were resolved.";
      message.updatedAt = this.timestamp();
      this.persistLedger();
      return message;
    }

    await this.dispatchMessage(message.id);
    this.auditLogger?.record({
      actorId: message.from.id,
      surface: "message-gateway-api",
      eventType: "message_gateway.message_created",
      action: "create_message",
      target: message.id,
      metadata: {
        recipientCount: message.deliveries.length,
        transportHint,
        status: message.status,
      },
    });
    return this.messages.get(message.id) ?? message;
  }

  async dispatchMessage(messageId: string): Promise<MessageGatewayMessage> {
    const message = this.messages.get(messageId);
    if (!message) throw new Error("Message not found.");

    for (const delivery of message.deliveries) {
      if (delivery.status !== "queued") continue;
      const adapter = this.adapters[delivery.transport];
      const renderedBody = renderProviderBody(message);
      try {
        const result = await adapter.send({ message, delivery, renderedBody });
        delivery.providerMessageId = result.externalId;
        delivery.providerUrl = result.externalUrl;
        delivery.taskId = result.taskId;
        delivery.contextId = result.contextId;
        delivery.metadata = result.metadata;
        delivery.status = result.status ?? "delivered";
        delivery.lastError = undefined;
        delivery.updatedAt = this.timestamp();
        this.events.push(this.event(
          message.id,
          delivery.status === "retryable_failure" ? "delivery.retryable_failure" : delivery.status === "failed" ? "delivery.failed" : "delivery.delivered",
          delivery.status === "retryable_failure" ? "Provider accepted retryable failure." : delivery.status === "failed" ? "Provider returned permanent failure." : "Provider delivery succeeded.",
          { providerMessageId: delivery.providerMessageId, providerUrl: delivery.providerUrl, taskId: delivery.taskId, contextId: delivery.contextId },
          delivery.id,
          delivery.transport,
        ));
      } catch (error) {
        delivery.retryCount += 1;
        delivery.status = isRetryableAdapterError(error) ? "retryable_failure" : "failed";
        delivery.lastError = errorMessage(error);
        delivery.updatedAt = this.timestamp();
        this.events.push(this.event(
          message.id,
          delivery.status === "retryable_failure" ? "delivery.retryable_failure" : "delivery.failed",
          delivery.lastError,
          {},
          delivery.id,
          delivery.transport,
        ));
      }
    }

    message.retryCount = message.deliveries.reduce((total, delivery) => total + delivery.retryCount, 0);
    message.status = statusForDeliveries(message.deliveries);
    message.lastError = message.deliveries.find((delivery) => delivery.lastError)?.lastError;
    message.updatedAt = this.timestamp();
    this.persistLedger();
    return message;
  }

  getMessage(messageId: string): MessageGatewayMessage | undefined {
    this.redactExpiredBodies();
    return this.messages.get(messageId);
  }

  listMessages(filter: { status?: string; recipient?: string } = {}): MessageGatewayMessage[] {
    this.redactExpiredBodies();
    const status = normalizeOptionalString(filter.status);
    const recipient = normalizeRecipientAddress(filter.recipient);
    return [...this.messages.values()]
      .filter((message) => !status || message.status === status)
      .filter((message) => !recipient || message.deliveries.some((delivery) => delivery.recipient === recipient))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  listEvents(messageId: string): MessageGatewayEvent[] {
    return this.events
      .filter((event) => event.messageId === messageId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  recordProviderEvent(transport: MessageGatewayChosenTransport, input: unknown): MessageGatewayEvent {
    const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const messageId = normalizeOptionalString(payload.message_id ?? payload.messageId ?? payload.gateway_message_id ?? payload.gatewayMessageId)
      || this.findMessageIdForProviderRef(payload);
    if (!messageId) throw new Error("Provider event did not include a known message reference.");
    const delivery = this.findDeliveryForProviderRef(messageId, payload, transport);
    const eventType: MessageGatewayEventType = providerEventLooksLikeReply(payload) ? "provider.reply" : "provider.delivery_event";
    const event = this.event(
      messageId,
      eventType,
      normalizeOptionalString(payload.text ?? payload.detail ?? payload.type) || `${transport} provider event synced.`,
      payload,
      delivery?.id,
      transport,
    );
    event.providerEventId = normalizeOptionalString(payload.event_id ?? payload.eventId ?? payload.ts ?? payload.name) || undefined;
    this.events.push(event);
    if (delivery) {
      const status = normalizeDeliveryStatus(payload.status ?? payload.delivery_status);
      if (status) {
        delivery.status = status;
        delivery.updatedAt = this.timestamp();
        const message = this.messages.get(messageId);
        if (message) {
          message.status = statusForDeliveries(message.deliveries);
          message.updatedAt = this.timestamp();
        }
      }
    }
    this.persistLedger();
    return event;
  }

  toHttpHandler(options: MessageGatewayHttpOptions = {}): (request: IncomingMessage, response: ServerResponse) => void {
    return createMessageGatewayHttpHandler(this, options);
  }

  private loadDirectory(directory: MessageGatewayDirectory): void {
    for (const person of directory.people ?? []) {
      const email = normalizeRecipientAddress(person.email);
      if (!email) continue;
      this.people.set(email, { ...person, email });
    }
    for (const group of directory.groups ?? []) {
      const alias = normalizeGroupAlias(group.alias);
      if (!alias) continue;
      this.groups.set(alias, {
        alias,
        members: group.members.map(normalizeRecipientAddress).filter(Boolean),
      });
    }
    for (const agent of directory.agents ?? []) {
      const agentId = normalizeAgentRecipient(agent.id);
      if (!agentId) continue;
      this.agents.set(agentId, { ...agent, id: agentId });
    }
  }

  private resolveRecipientRoutes(message: MessageGatewayMessage, rawRecipient: string): RouteResult[] {
    const recipient = normalizeRecipientAddress(rawRecipient);
    if (!recipient) return [this.rejectedRoute(message.id, rawRecipient, "Recipient address is empty.")];
    if (recipient.startsWith("group:")) {
      const group = this.groups.get(normalizeGroupAlias(recipient));
      if (!group) return [this.rejectedRoute(message.id, recipient, "Group alias was not found.")];
      return group.members.flatMap((member) => this.resolveRecipientRoutes(message, member));
    }
    if (recipient.startsWith("agent:")) return [this.resolveAgentRoute(message, recipient)];
    return [this.resolvePersonRoute(message, recipient)];
  }

  private resolvePersonRoute(message: MessageGatewayMessage, recipient: string): RouteResult {
    if (!recipient.endsWith("@telnyx.com")) return this.rejectedRoute(message.id, recipient, "Human recipients must use an @telnyx.com email address.");
    const person = this.people.get(recipient);
    if (!person) return this.rejectedRoute(message.id, recipient, "Recipient was not found in the active Telnyx directory.");
    if (!person.active) return this.rejectedRoute(message.id, recipient, "Recipient is not active in the Telnyx directory.");
    const route = chooseHumanRoute(person, message.transportHint);
    if (!route.transport) return this.rejectedRoute(message.id, recipient, route.reason);
    const now = this.timestamp();
    const delivery: MessageGatewayDelivery = {
      id: `delivery-${this.idGenerator()}`,
      recipient,
      recipientType: "person",
      transport: route.transport,
      status: "queued",
      routeReason: route.reason,
      providerRecipientId: route.transport === "slack" ? person.slackUserId : person.googleChatUser,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    return {
      delivery,
      event: this.event(message.id, "delivery.queued", route.reason, { recipient }, delivery.id, route.transport),
    };
  }

  private resolveAgentRoute(message: MessageGatewayMessage, recipient: string): RouteResult {
    const agent = this.agents.get(recipient) ?? { id: recipient, active: true };
    if (!agent.active) return this.rejectedRoute(message.id, recipient, "Agent recipient is not active.");
    if (message.transportHint !== "auto" && message.transportHint !== "a2a") {
      return this.rejectedRoute(message.id, recipient, "Agent recipients can only use the A2A transport in v1.");
    }
    const now = this.timestamp();
    const delivery: MessageGatewayDelivery = {
      id: `delivery-${this.idGenerator()}`,
      recipient,
      recipientType: "agent",
      transport: "a2a",
      status: "queued",
      routeReason: message.transportHint === "a2a" ? "Explicit A2A transport selected for agent recipient." : "Agent recipient routed through A2A.",
      providerRecipientId: agent.endpoint || recipient,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    return {
      delivery,
      event: this.event(message.id, "delivery.queued", delivery.routeReason, { recipient }, delivery.id, "a2a"),
    };
  }

  private rejectedRoute(messageId: string, recipient: string, reason: string): RouteResult {
    return {
      event: this.event(messageId, "delivery.rejected", reason, { recipient: normalizeRecipientAddress(recipient) }),
    };
  }

  private event(
    messageId: string,
    type: MessageGatewayEventType,
    detail: string,
    metadata: Record<string, unknown> = {},
    deliveryId?: string,
    transport?: MessageGatewayChosenTransport,
  ): MessageGatewayEvent {
    return {
      id: `event-${this.idGenerator()}`,
      messageId,
      ...(deliveryId ? { deliveryId } : {}),
      type,
      ...(transport ? { transport } : {}),
      detail,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      createdAt: this.timestamp(),
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private loadStoredLedger(): { messages: MessageGatewayMessage[]; events: MessageGatewayEvent[]; idempotency: [string, string][] } {
    if (!this.storagePath || !existsSync(this.storagePath)) return { messages: [], events: [], idempotency: [] };
    const payload = JSON.parse(readFileSync(this.storagePath, "utf8")) as StoredMessageGatewayLedger;
    return {
      messages: Array.isArray(payload.messages) ? payload.messages.map(normalizeStoredMessage).filter(Boolean) as MessageGatewayMessage[] : [],
      events: Array.isArray(payload.events) ? payload.events.map(normalizeStoredEvent).filter(Boolean) as MessageGatewayEvent[] : [],
      idempotency: Array.isArray(payload.idempotency)
        ? payload.idempotency.map(normalizeStoredIdempotency).filter(Boolean) as [string, string][]
        : [],
    };
  }

  private persistLedger(): void {
    this.redactExpiredBodies();
    if (!this.storagePath) return;
    mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const temporaryPath = `${this.storagePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({
      messages: [...this.messages.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      events: this.events.slice(-10_000),
      idempotency: [...this.idempotency.entries()],
    }, null, 2));
    renameSync(temporaryPath, this.storagePath);
  }

  private redactExpiredBodies(): void {
    const cutoff = this.now().getTime() - this.bodyRetentionMs;
    for (const message of this.messages.values()) {
      if (!message.body || Date.parse(message.createdAt) >= cutoff) continue;
      message.body = undefined;
      message.bodyRedactedAt = message.bodyRedactedAt ?? this.timestamp();
    }
  }

  private findMessageIdForProviderRef(payload: Record<string, unknown>): string {
    const ref = normalizeOptionalString(payload.provider_message_id ?? payload.providerMessageId ?? payload.ts ?? payload.name);
    if (!ref) return "";
    for (const message of this.messages.values()) {
      if (message.deliveries.some((delivery) => delivery.providerMessageId === ref || delivery.providerThreadId === ref)) return message.id;
    }
    return "";
  }

  private findDeliveryForProviderRef(messageId: string, payload: Record<string, unknown>, transport: MessageGatewayChosenTransport): MessageGatewayDelivery | undefined {
    const message = this.messages.get(messageId);
    const ref = normalizeOptionalString(payload.delivery_id ?? payload.deliveryId ?? payload.provider_message_id ?? payload.providerMessageId ?? payload.ts ?? payload.name);
    if (!message) return undefined;
    return message.deliveries.find((delivery) => (
      delivery.transport === transport &&
      (delivery.id === ref || delivery.providerMessageId === ref || delivery.providerThreadId === ref || !ref)
    ));
  }
}

export class RecordOnlyMessageGatewayAdapter implements MessageGatewayAdapter {
  readonly mode = "record-only";

  constructor(private readonly transport: MessageGatewayChosenTransport) {}

  async send(request: MessageGatewayAdapterSendRequest): Promise<MessageGatewayProviderResult> {
    const externalId = `${this.transport}:${request.message.id}:${request.delivery.id}`;
    if (this.transport === "a2a") {
      return {
        externalId,
        taskId: `task-${request.delivery.id}`,
        contextId: `context-${request.message.id}`,
        metadata: { renderedBody: request.renderedBody },
      };
    }
    return {
      externalId,
      externalUrl: this.transport === "slack"
        ? `https://slack.com/app_redirect?channel=${encodeURIComponent(request.delivery.providerRecipientId || request.delivery.recipient)}`
        : "https://chat.google.com/",
      metadata: { renderedBody: request.renderedBody },
    };
  }
}

export function createMessageGatewayHttpHandler(
  service = new MessageGatewayService(),
  options: MessageGatewayHttpOptions = {},
): (request: IncomingMessage, response: ServerResponse) => void {
  const requireAuth = options.requireAuth ?? true;
  const requireAuthContext = Boolean(options.requireAuthContext);
  return (request, response) => {
    void handleMessageGatewayRequest(service, request, response, { requireAuth, requireAuthContext });
  };
}

export function createMessageGatewayServer(
  service = new MessageGatewayService(),
  options: MessageGatewayHttpOptions = {},
): Server {
  return createServer(createMessageGatewayHttpHandler(service, options));
}

export async function listenMessageGatewayServer(
  server: Server,
  port = 0,
  hostname = "127.0.0.1",
): Promise<{ url: string; close: () => Promise<void> }> {
  await new Promise<void>((resolve) => {
    server.listen(port, hostname, resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://${address.address}:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function handleMessageGatewayRequest(
  service: MessageGatewayService,
  request: IncomingMessage,
  response: ServerResponse,
  options: Required<MessageGatewayHttpOptions>,
): Promise<void> {
  messageGatewayHttpRequestsTotal += 1;
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      sendJson(response, 200, { ok: true, service: "link-message-gateway" });
      return;
    }
    if (request.method === "GET" && request.url === "/readyz") {
      const readiness = withHttpReadinessChecks(service.readiness(), options);
      sendJson(response, readiness.ready ? 200 : 503, readiness);
      return;
    }
    if (request.method === "GET" && request.url === "/metrics") {
      sendText(response, 200, "text/plain; version=0.0.4; charset=utf-8", messageGatewayMetricsText());
      return;
    }
    if (options.requireAuth && !isAuthorizedMessageGatewayRequest(request, options.requireAuthContext)) {
      sendJson(response, 401, {
        error: options.requireAuthContext
          ? "Cloud Link Message Gateway requires auth plus Telnyx actor or group context."
          : "Cloud Link Message Gateway requires Okta Rev2 auth or TELNYX_API_KEY.",
      });
      return;
    }

    const url = new URL(request.url ?? "/", "http://link-message-gateway.internal");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const actor = actorFromRequest(request);
    if (request.method === "POST" && parts.length === 1 && parts[0] === "messages") {
      const input = await readJson(request) as MessageGatewayInput;
      const message = await service.createMessage(input, actor, headerString(request, "x-link-transport"));
      sendJson(response, 202, { message });
      return;
    }
    if (request.method === "GET" && parts.length === 1 && parts[0] === "messages") {
      sendJson(response, 200, {
        messages: service.listMessages({
          status: url.searchParams.get("status") ?? undefined,
          recipient: url.searchParams.get("recipient") ?? undefined,
        }),
      });
      return;
    }
    if (request.method === "GET" && parts.length === 2 && parts[0] === "messages") {
      const message = service.getMessage(parts[1]);
      sendJson(response, message ? 200 : 404, message ? { message } : { error: "Message not found." });
      return;
    }
    if (request.method === "GET" && parts.length === 3 && parts[0] === "messages" && parts[2] === "events") {
      if (!service.getMessage(parts[1])) {
        sendJson(response, 404, { error: "Message not found." });
        return;
      }
      sendJson(response, 200, { events: service.listEvents(parts[1]) });
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "webhooks" && parts[1] === "slack" && parts[2] === "events") {
      const input = await readJson(request);
      if (input && typeof input === "object" && "challenge" in input) {
        sendJson(response, 200, { challenge: (input as { challenge?: unknown }).challenge });
        return;
      }
      sendJson(response, 202, { event: service.recordProviderEvent("slack", input) });
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "webhooks" && parts[1] === "google-chat" && parts[2] === "events") {
      sendJson(response, 202, { event: service.recordProviderEvent("google_chat", await readJson(request)) });
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 400, { error: errorMessage(error) });
  }
}

function withHttpReadinessChecks(
  readiness: MessageGatewayReadiness,
  options: Required<MessageGatewayHttpOptions>,
): MessageGatewayReadiness {
  const checks = [
    ...readiness.checks,
    {
      name: "Gateway auth required",
      ok: options.requireAuth,
      detail: options.requireAuth ? "auth is required for message gateway API requests" : "production gateway must not run with --dev-no-auth",
    },
    {
      name: "Authenticated actor context enforced",
      ok: options.requireAuth && options.requireAuthContext,
      detail: options.requireAuthContext
        ? "actor or group context is required for audited delivery"
        : "set LINK_MESSAGE_GATEWAY_REQUIRE_AUTH_CONTEXT=1 or --require-auth-context",
    },
  ];
  return {
    ...readiness,
    ready: checks.every((check) => check.ok),
    checks,
  };
}

function messageGatewayMetricsText(): string {
  const uptimeSeconds = Math.max(0, (Date.now() - messageGatewayMetricsStartedAt) / 1000);
  return [
    "# HELP link_message_gateway_up Cloud Link Message Gateway process health.",
    "# TYPE link_message_gateway_up gauge",
    "link_message_gateway_up 1",
    "# HELP link_message_gateway_http_requests_total Total HTTP requests handled by Cloud Link Message Gateway.",
    "# TYPE link_message_gateway_http_requests_total counter",
    `link_message_gateway_http_requests_total ${messageGatewayHttpRequestsTotal}`,
    "# HELP link_message_gateway_process_uptime_seconds Cloud Link Message Gateway process uptime in seconds.",
    "# TYPE link_message_gateway_process_uptime_seconds gauge",
    `link_message_gateway_process_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
    "",
  ].join("\n");
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += bytes.byteLength;
    if (totalBytes > 256_000) throw new Error("Request body is too large.");
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response: ServerResponse, statusCode: number, contentType: string, body: string): void {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(body);
}

function isAuthorizedMessageGatewayRequest(request: IncomingMessage, requireAuthContext = false): boolean {
  const authorization = request.headers.authorization ?? "";
  const authenticated = authorization.startsWith("Bearer ") || Boolean(request.headers["x-telnyx-auth-rev2"] || request.headers["x-telnyx-api-key"]);
  if (!authenticated) return false;
  if (!requireAuthContext) return true;
  return Boolean(rawActorFromRequest(request) || headerString(request, "x-telnyx-groups") || headerString(request, "x-on-behalf-of"));
}

function actorFromRequest(request: IncomingMessage): MessageGatewayActor {
  return normalizeActor({
    id: rawActorFromRequest(request),
    displayName: headerString(request, "x-telnyx-actor-name"),
    email: headerString(request, "x-telnyx-actor-email"),
  });
}

function rawActorFromRequest(request: IncomingMessage): string {
  return headerString(request, "x-telnyx-actor") || headerString(request, "x-actor") || headerString(request, "x-telnyx-user");
}

function headerString(request: IncomingMessage, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(",") : value ?? "";
}

function normalizeActor(value: unknown): MessageGatewayActor {
  if (typeof value === "string") {
    const id = normalizeOptionalString(value);
    return { id: id || "anonymous" };
  }
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const email = normalizeOptionalString(record.email);
  const id = normalizeOptionalString(record.id ?? record.actor ?? record.user ?? email) || "anonymous";
  return {
    id,
    displayName: normalizeOptionalString(record.displayName ?? record.display_name ?? record.name) || undefined,
    email: email || (id.includes("@") ? id : undefined),
  };
}

function normalizeRecipients(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  return [...new Set(values.map(normalizeRecipientAddress).filter(Boolean))];
}

function normalizeRecipientAddress(value: unknown): string {
  const text = normalizeOptionalString(value).toLowerCase();
  if (text.startsWith("agent:")) return normalizeAgentRecipient(text);
  if (text.startsWith("group:")) return normalizeGroupAlias(text);
  return text;
}

function normalizeAgentRecipient(value: unknown): string {
  const text = normalizeOptionalString(value).toLowerCase();
  const id = text.startsWith("agent:") ? text.slice("agent:".length) : text;
  return id ? `agent:${id.replace(/[^a-z0-9:_./-]+/g, "-")}` : "";
}

function normalizeGroupAlias(value: unknown): string {
  const text = normalizeOptionalString(value).toLowerCase();
  const id = text.startsWith("group:") ? text.slice("group:".length) : text;
  return id ? `group:${id.replace(/[^a-z0-9:_./-]+/g, "-")}` : "";
}

function normalizeTransport(value: unknown): MessageGatewayTransport {
  const text = normalizeOptionalString(value).toLowerCase().replace(/-/g, "_");
  if (text === "slack" || text === "google_chat" || text === "a2a" || text === "auto") return text;
  return "auto";
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function chooseHumanRoute(person: MessageGatewayPerson, hint: MessageGatewayTransport): { transport?: MessageGatewayChosenTransport; reason: string } {
  if (hint === "slack") {
    return person.slackUserId
      ? { transport: "slack", reason: "Explicit Slack transport selected." }
      : { reason: "Explicit Slack transport selected, but no Slack mapping exists for recipient." };
  }
  if (hint === "google_chat") {
    return person.googleChatUser
      ? { transport: "google_chat", reason: "Explicit Google Chat transport selected." }
      : { reason: "Explicit Google Chat transport selected, but no Google Chat mapping exists for recipient." };
  }
  if (hint === "a2a") return { reason: "Human recipients cannot use A2A transport in v1." };
  if (person.preferredTransport === "slack" && person.slackUserId) return { transport: "slack", reason: "Recipient preference selected Slack." };
  if (person.preferredTransport === "google_chat" && person.googleChatUser) return { transport: "google_chat", reason: "Recipient preference selected Google Chat." };
  if (person.slackUserId) return { transport: "slack", reason: "Default human route selected Slack because a Slack mapping exists." };
  if (person.googleChatUser) return { transport: "google_chat", reason: "Slack mapping missing; Google Chat fallback selected." };
  return { reason: "No Slack or Google Chat mapping exists for recipient." };
}

function renderProviderBody(message: MessageGatewayMessage): string {
  const sender = message.from.displayName || message.from.email || message.from.id || "Unknown sender";
  return [
    `From ${sender} via Link`,
    message.subject ? `Subject: ${message.subject}` : "",
    "",
    message.body || "[message body redacted after delivery retention window]",
  ].filter((line, index) => line || index === 2).join("\n");
}

function statusForDeliveries(deliveries: MessageGatewayDelivery[]): MessageGatewayStatus {
  if (deliveries.length === 0) return "rejected";
  if (deliveries.every((delivery) => delivery.status === "rejected")) return "rejected";
  if (deliveries.every((delivery) => delivery.status === "delivered")) return "delivered";
  if (deliveries.some((delivery) => delivery.status === "delivered")) return "partial";
  if (deliveries.some((delivery) => delivery.status === "queued" || delivery.status === "retryable_failure")) return "accepted";
  return "failed";
}

function normalizeDeliveryStatus(value: unknown): MessageGatewayDeliveryStatus | "" {
  const text = normalizeOptionalString(value);
  if (text === "queued" || text === "delivered" || text === "retryable_failure" || text === "failed" || text === "rejected") return text;
  return "";
}

function isRetryableAdapterError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "retryable" in error && (error as { retryable?: unknown }).retryable);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function providerEventLooksLikeReply(payload: Record<string, unknown>): boolean {
  const type = normalizeOptionalString(payload.type ?? payload.event_type ?? payload.eventType).toLowerCase();
  return type.includes("reply") || Boolean(payload.thread_ts || payload.replyTo || payload.reply_to);
}

function normalizeStoredMessage(value: unknown): MessageGatewayMessage | null {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = normalizeOptionalString(record.id);
  if (!id) return null;
  return {
    id,
    from: normalizeActor(record.from),
    to: normalizeRecipients(record.to),
    body: normalizeOptionalString(record.body) || undefined,
    bodyRedactedAt: normalizeOptionalString(record.bodyRedactedAt ?? record.body_redacted_at) || undefined,
    subject: normalizeOptionalString(record.subject) || undefined,
    metadata: normalizeMetadata(record.metadata),
    idempotencyKey: normalizeOptionalString(record.idempotencyKey ?? record.idempotency_key),
    transportHint: normalizeTransport(record.transportHint ?? record.transport_hint),
    status: normalizeMessageStatus(record.status),
    deliveries: Array.isArray(record.deliveries) ? record.deliveries.map(normalizeStoredDelivery).filter(Boolean) as MessageGatewayDelivery[] : [],
    retryCount: Number.isInteger(record.retryCount) ? record.retryCount as number : 0,
    lastError: normalizeOptionalString(record.lastError ?? record.last_error) || undefined,
    createdAt: normalizeOptionalString(record.createdAt ?? record.created_at) || new Date(0).toISOString(),
    updatedAt: normalizeOptionalString(record.updatedAt ?? record.updated_at) || new Date(0).toISOString(),
  };
}

function normalizeStoredDelivery(value: unknown): MessageGatewayDelivery | null {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = normalizeOptionalString(record.id);
  const recipient = normalizeRecipientAddress(record.recipient);
  const transport = normalizeTransport(record.transport);
  if (!id || !recipient || transport === "auto") return null;
  return {
    id,
    recipient,
    recipientType: record.recipientType === "agent" || record.recipient_type === "agent" ? "agent" : "person",
    transport,
    status: normalizeDeliveryStatus(record.status) || "queued",
    routeReason: normalizeOptionalString(record.routeReason ?? record.route_reason),
    providerRecipientId: normalizeOptionalString(record.providerRecipientId ?? record.provider_recipient_id) || undefined,
    providerMessageId: normalizeOptionalString(record.providerMessageId ?? record.provider_message_id) || undefined,
    providerThreadId: normalizeOptionalString(record.providerThreadId ?? record.provider_thread_id) || undefined,
    providerUrl: normalizeOptionalString(record.providerUrl ?? record.provider_url) || undefined,
    taskId: normalizeOptionalString(record.taskId ?? record.task_id) || undefined,
    contextId: normalizeOptionalString(record.contextId ?? record.context_id) || undefined,
    retryCount: Number.isInteger(record.retryCount) ? record.retryCount as number : 0,
    lastError: normalizeOptionalString(record.lastError ?? record.last_error) || undefined,
    createdAt: normalizeOptionalString(record.createdAt ?? record.created_at) || new Date(0).toISOString(),
    updatedAt: normalizeOptionalString(record.updatedAt ?? record.updated_at) || new Date(0).toISOString(),
    metadata: normalizeMetadata(record.metadata),
  };
}

function normalizeStoredEvent(value: unknown): MessageGatewayEvent | null {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = normalizeOptionalString(record.id);
  const messageId = normalizeOptionalString(record.messageId ?? record.message_id);
  const type = normalizeEventType(record.type);
  if (!id || !messageId || !type) return null;
  const transport = normalizeTransport(record.transport);
  return {
    id,
    messageId,
    deliveryId: normalizeOptionalString(record.deliveryId ?? record.delivery_id) || undefined,
    type,
    transport: transport === "auto" ? undefined : transport,
    providerEventId: normalizeOptionalString(record.providerEventId ?? record.provider_event_id) || undefined,
    detail: normalizeOptionalString(record.detail),
    metadata: normalizeMetadata(record.metadata),
    createdAt: normalizeOptionalString(record.createdAt ?? record.created_at) || new Date(0).toISOString(),
  };
}

function normalizeStoredIdempotency(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const key = normalizeOptionalString(value[0]);
  const messageId = normalizeOptionalString(value[1]);
  return key && messageId ? [key, messageId] : null;
}

function normalizeMessageStatus(value: unknown): MessageGatewayStatus {
  const text = normalizeOptionalString(value);
  if (text === "accepted" || text === "partial" || text === "delivered" || text === "failed" || text === "rejected") return text;
  return "accepted";
}

function normalizeEventType(value: unknown): MessageGatewayEventType | "" {
  const text = normalizeOptionalString(value);
  if ([
    "message.accepted",
    "message.idempotent_replay",
    "delivery.queued",
    "delivery.delivered",
    "delivery.retryable_failure",
    "delivery.failed",
    "delivery.rejected",
    "provider.reply",
    "provider.delivery_event",
  ].includes(text)) return text as MessageGatewayEventType;
  return "";
}

function defaultMessageGatewayDirectory(): MessageGatewayDirectory {
  return {
    people: [
      {
        email: "alice@telnyx.com",
        displayName: "Alice",
        active: true,
        slackUserId: "U_ALICE",
        googleChatUser: "users/alice",
      },
      {
        email: "bob@telnyx.com",
        displayName: "Bob",
        active: true,
        googleChatUser: "users/bob",
      },
      {
        email: "casey@telnyx.com",
        displayName: "Casey",
        active: true,
        slackUserId: "U_CASEY",
        googleChatUser: "users/casey",
        preferredTransport: "google_chat",
      },
      {
        email: "inactive@telnyx.com",
        displayName: "Inactive Employee",
        active: false,
        slackUserId: "U_INACTIVE",
      },
    ],
    groups: [
      {
        alias: "group:messaging-ops",
        members: ["alice@telnyx.com", "bob@telnyx.com"],
      },
    ],
    agents: [
      {
        id: "agent:aida",
        displayName: "AIDA",
        active: true,
      },
    ],
  };
}
