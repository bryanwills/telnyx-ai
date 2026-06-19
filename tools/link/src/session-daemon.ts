import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { AuditLogger } from "./types.js";

const sessionDaemonMetricsStartedAt = Date.now();
let sessionDaemonHttpRequestsTotal = 0;

export type CloudLinkSessionAgentState = "idle" | "working" | "blocked" | "needs_approval" | "done";
export type CloudLinkSessionLifecycle = "starting" | "running" | "stopped" | "failed";
export type CloudLinkSessionAttachStatus = "pending" | "approved" | "denied" | "expired";
export type CloudLinkSessionEventType =
  | "session.created"
  | "session.started"
  | "session.input_sent"
  | "session.state_changed"
  | "session.stopped"
  | "session.failed"
  | "attach.requested"
  | "attach.approved"
  | "attach.denied"
  | "notification.sms_sent"
  | "notification.sms_failed"
  | "notification.sms_skipped"
  | "session.idempotent_replay";

export interface CloudLinkSessionActor {
  id: string;
  displayName?: string;
  email?: string;
}

export interface CloudLinkSessionInput {
  title?: unknown;
  cwd?: unknown;
  command?: unknown;
  agent?: unknown;
  repository?: unknown;
  metadata?: unknown;
  notifications?: unknown;
  idempotency_key?: unknown;
  idempotencyKey?: unknown;
}

export interface CloudLinkSessionNotificationSettings {
  sms?: {
    enabled: boolean;
    to: string;
    from: string;
    onStates: CloudLinkSessionAgentState[];
  };
  mobileUrl?: string;
}

export interface CloudLinkSessionRunnerRef {
  mode: string;
  externalId?: string;
  attachUrl?: string;
  cwd?: string;
  command?: string;
}

export interface CloudLinkSession {
  id: string;
  title: string;
  cwd: string;
  command?: string;
  agent?: string;
  repository?: string;
  owner: CloudLinkSessionActor;
  lifecycle: CloudLinkSessionLifecycle;
  agentState: CloudLinkSessionAgentState;
  output: string;
  runner: CloudLinkSessionRunnerRef;
  notifications: CloudLinkSessionNotificationSettings;
  notificationState: {
    smsLastState?: CloudLinkSessionAgentState;
    smsLastAt?: string;
    smsLastError?: string;
  };
  metadata: Record<string, unknown>;
  idempotencyKey: string;
  attachRequests: CloudLinkSessionAttachRequest[];
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloudLinkSessionAttachRequest {
  id: string;
  sessionId: string;
  clientLabel: string;
  clientKind: "desktop" | "mobile" | "cli" | "api";
  status: CloudLinkSessionAttachStatus;
  requestedBy: CloudLinkSessionActor;
  approvedBy?: CloudLinkSessionActor;
  deniedBy?: CloudLinkSessionActor;
  reason?: string;
  oneTimeCode: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloudLinkSessionEvent {
  id: string;
  sessionId: string;
  type: CloudLinkSessionEventType;
  detail: string;
  actor?: CloudLinkSessionActor;
  attachRequestId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CloudLinkSessionRequestContext {
  actor?: CloudLinkSessionActor | string;
  telnyxApiKey?: string;
  bearerToken?: string;
  groups?: string[];
  onBehalfOf?: string;
  surface?: string;
}

export interface CloudLinkSessionReadinessCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface CloudLinkSessionReadiness {
  ready: boolean;
  service: "link-session-daemon";
  storage: {
    configured: boolean;
    path?: string;
    retention: "session-ledger";
  };
  runner: {
    configured: boolean;
    mode: string;
  };
  notifications: {
    sms: {
      configured: boolean;
      mode: string;
    };
    push: {
      configured: false;
      mode: "disabled";
    };
    email: {
      configured: false;
      mode: "disabled";
    };
  };
  checks: CloudLinkSessionReadinessCheck[];
}

export interface CloudLinkSessionHttpOptions {
  requireAuth?: boolean;
  requireAuthContext?: boolean;
}

export interface CloudLinkSessionRunnerStartRequest {
  session: CloudLinkSession;
  context: CloudLinkSessionRequestContext;
}

export interface CloudLinkSessionRunnerInputRequest {
  session: CloudLinkSession;
  text: string;
  context: CloudLinkSessionRequestContext;
}

export interface CloudLinkSessionRunnerStopRequest {
  session: CloudLinkSession;
  context: CloudLinkSessionRequestContext;
}

export interface CloudLinkSessionRunnerResult {
  externalId?: string;
  attachUrl?: string;
  output?: string;
  lifecycle?: CloudLinkSessionLifecycle;
  agentState?: CloudLinkSessionAgentState;
  metadata?: Record<string, unknown>;
}

export interface CloudLinkSessionRunner {
  readonly mode?: string;
  start(request: CloudLinkSessionRunnerStartRequest): Promise<CloudLinkSessionRunnerResult>;
  sendInput(request: CloudLinkSessionRunnerInputRequest): Promise<CloudLinkSessionRunnerResult>;
  stop(request: CloudLinkSessionRunnerStopRequest): Promise<CloudLinkSessionRunnerResult>;
  checkReadiness?(): CloudLinkSessionReadinessCheck[];
}

export interface CloudLinkSmsNotificationRequest {
  apiKey: string;
  from: string;
  to: string;
  text: string;
  session: CloudLinkSession;
  state: CloudLinkSessionAgentState;
}

export interface CloudLinkSmsNotificationResult {
  externalId: string;
  externalUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CloudLinkSmsNotificationAdapter {
  readonly mode?: string;
  sendSms(request: CloudLinkSmsNotificationRequest): Promise<CloudLinkSmsNotificationResult>;
  checkReadiness?(): CloudLinkSessionReadinessCheck[];
}

export interface CloudLinkSessionServiceOptions {
  auditLogger?: AuditLogger;
  idGenerator?: () => string;
  now?: () => Date;
  storagePath?: string;
  outputRetentionBytes?: number;
  attachRequestTtlMs?: number;
  runner?: CloudLinkSessionRunner;
  smsAdapter?: CloudLinkSmsNotificationAdapter;
}

interface StoredCloudLinkSessionLedger {
  sessions?: unknown;
  events?: unknown;
  idempotency?: unknown;
}

export class CloudLinkSessionService {
  private readonly sessions = new Map<string, CloudLinkSession>();
  private readonly events: CloudLinkSessionEvent[] = [];
  private readonly idempotency = new Map<string, string>();
  private readonly auditLogger?: AuditLogger;
  private readonly idGenerator: () => string;
  private readonly now: () => Date;
  private readonly storagePath?: string;
  private readonly outputRetentionBytes: number;
  private readonly attachRequestTtlMs: number;
  private readonly runner: CloudLinkSessionRunner;
  private readonly smsAdapter: CloudLinkSmsNotificationAdapter;

  constructor(options: CloudLinkSessionServiceOptions = {}) {
    this.auditLogger = options.auditLogger;
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.storagePath = options.storagePath;
    this.outputRetentionBytes = options.outputRetentionBytes ?? 160_000;
    this.attachRequestTtlMs = options.attachRequestTtlMs ?? 10 * 60 * 1000;
    this.runner = options.runner ?? new RecordOnlyCloudLinkSessionRunner();
    this.smsAdapter = options.smsAdapter ?? new RecordOnlyCloudLinkSmsAdapter();
    const stored = this.loadStoredLedger();
    for (const session of stored.sessions) this.sessions.set(session.id, session);
    this.events.push(...stored.events);
    for (const [key, sessionId] of stored.idempotency) this.idempotency.set(key, sessionId);
    this.expireAttachRequests();
  }

  readiness(): CloudLinkSessionReadiness {
    const runnerChecks = this.runner.checkReadiness?.() ?? [{
      name: "Session runner configured",
      ok: this.runner.mode !== "record-only",
      detail: this.runner.mode === "record-only"
        ? "record-only runner is active; configure a Telnyx-hosted PTY runner for production"
        : `${this.runner.mode ?? "custom"} runner is available`,
    }];
    const smsChecks = this.smsAdapter.checkReadiness?.() ?? [{
      name: "Telnyx SMS notifications configured",
      ok: true,
      detail: `${this.smsAdapter.mode ?? "custom"} SMS adapter is available; per-user TELNYX_API_KEY is required when sending`,
    }];
    const checks = [
      {
        name: "Session ledger storage configured",
        ok: Boolean(this.storagePath),
        detail: this.storagePath ? "persistent session ledger path configured" : "LINK_SESSION_DAEMON_STORAGE or --storage is required for production",
      },
      ...runnerChecks,
      ...smsChecks,
      {
        name: "Push notifications disabled",
        ok: true,
        detail: "push is intentionally disabled until Cloud Link mobile app support exists",
      },
      {
        name: "Email notifications disabled",
        ok: true,
        detail: "email is intentionally disabled; SMS is the only v1 notification channel",
      },
    ];
    return {
      ready: checks.every((check) => check.ok),
      service: "link-session-daemon",
      storage: {
        configured: Boolean(this.storagePath),
        path: this.storagePath,
        retention: "session-ledger",
      },
      runner: {
        configured: this.runner.mode !== "record-only",
        mode: this.runner.mode ?? "custom",
      },
      notifications: {
        sms: {
          configured: this.smsAdapter.mode !== "record-only",
          mode: this.smsAdapter.mode ?? "custom",
        },
        push: { configured: false, mode: "disabled" },
        email: { configured: false, mode: "disabled" },
      },
      checks,
    };
  }

  async createSession(input: CloudLinkSessionInput = {}, context: CloudLinkSessionRequestContext = {}): Promise<CloudLinkSession> {
    this.expireAttachRequests();
    const actor = normalizeActor(context.actor);
    const idempotencyKey = normalizeOptionalString(input.idempotency_key ?? input.idempotencyKey);
    if (!idempotencyKey) throw new Error("idempotency_key is required.");
    const scopedKey = `${actor.id}:${idempotencyKey}`;
    const existingId = this.idempotency.get(scopedKey);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing) {
        this.events.push(this.event(existing.id, "session.idempotent_replay", "Duplicate idempotency_key returned the original Cloud Link session.", actor));
        this.persistLedger();
        return existing;
      }
    }

    const now = this.timestamp();
    const session: CloudLinkSession = {
      id: `cls-${this.idGenerator()}`,
      title: normalizeOptionalString(input.title) || "Cloud Link Session",
      cwd: normalizeOptionalString(input.cwd) || "/workspace",
      command: normalizeOptionalString(input.command) || undefined,
      agent: normalizeOptionalString(input.agent) || undefined,
      repository: normalizeOptionalString(input.repository) || undefined,
      owner: actor,
      lifecycle: "starting",
      agentState: normalizeOptionalString(input.command) ? "working" : "idle",
      output: "",
      runner: { mode: this.runner.mode ?? "custom" },
      notifications: normalizeNotifications(input.notifications),
      notificationState: {},
      metadata: normalizeMetadata(input.metadata),
      idempotencyKey,
      attachRequests: [],
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    this.idempotency.set(scopedKey, session.id);
    this.events.push(this.event(session.id, "session.created", "Cloud Link session envelope created.", actor, {
      commandConfigured: Boolean(session.command),
      notificationChannels: Object.keys(session.notifications).filter((key) => key !== "mobileUrl"),
    }));

    try {
      const started = await this.runner.start({ session, context: { ...context, actor } });
      applyRunnerResult(session, started);
      session.lifecycle = started.lifecycle ?? "running";
      session.runner = {
        mode: this.runner.mode ?? "custom",
        externalId: started.externalId,
        attachUrl: started.attachUrl,
        cwd: session.cwd,
        command: session.command,
      };
      session.updatedAt = this.timestamp();
      if (started.output) this.appendOutput(session, started.output);
      this.events.push(this.event(session.id, "session.started", "Session runner accepted the PTY/agent workload.", actor, {
        runnerMode: session.runner.mode,
        externalId: session.runner.externalId,
      }));
    } catch (error) {
      session.lifecycle = "failed";
      session.agentState = "blocked";
      session.lastError = errorMessage(error);
      session.updatedAt = this.timestamp();
      this.events.push(this.event(session.id, "session.failed", session.lastError, actor));
    }

    this.auditLogger?.record({
      actorId: actor.id,
      surface: context.surface ?? "session-daemon-api",
      eventType: "session_daemon.session_created",
      action: "create_session",
      target: session.id,
      metadata: {
        lifecycle: session.lifecycle,
        agentState: session.agentState,
        runnerMode: session.runner.mode,
      },
    });
    await this.maybeNotifyState(session, undefined, { ...context, actor });
    this.persistLedger();
    return session;
  }

  listSessions(filter: { state?: string; owner?: string } = {}): CloudLinkSession[] {
    this.expireAttachRequests();
    const state = normalizeAgentState(filter.state);
    const owner = normalizeOptionalString(filter.owner).toLowerCase();
    return [...this.sessions.values()]
      .filter((session) => !state || session.agentState === state)
      .filter((session) => !owner || session.owner.id.toLowerCase() === owner || session.owner.email?.toLowerCase() === owner)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getSession(sessionId: string): CloudLinkSession | undefined {
    this.expireAttachRequests();
    return this.sessions.get(normalizeSessionId(sessionId));
  }

  listEvents(sessionId: string): CloudLinkSessionEvent[] {
    const id = normalizeSessionId(sessionId);
    return this.events
      .filter((event) => event.sessionId === id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async sendInput(sessionId: string, text: unknown, context: CloudLinkSessionRequestContext = {}): Promise<CloudLinkSession> {
    const session = this.requireSession(sessionId);
    const input = normalizeOptionalString(text);
    if (!input) throw new Error("text is required.");
    const actor = normalizeActor(context.actor);
    const previousState = session.agentState;
    const result = await this.runner.sendInput({ session, text: input, context: { ...context, actor } });
    this.appendOutput(session, result.output ?? `> ${input}\n`);
    applyRunnerResult(session, result);
    session.lifecycle = result.lifecycle ?? "running";
    session.agentState = result.agentState ?? "working";
    session.updatedAt = this.timestamp();
    this.events.push(this.event(session.id, "session.input_sent", "Input sent to the server-owned Cloud Link session.", actor, {
      inputBytes: Buffer.byteLength(input),
    }));
    this.auditLogger?.record({
      actorId: actor.id,
      surface: context.surface ?? "session-daemon-api",
      eventType: "session_daemon.input_sent",
      action: "send_input",
      target: session.id,
      metadata: { inputBytes: Buffer.byteLength(input) },
    });
    await this.maybeNotifyState(session, previousState, { ...context, actor });
    this.persistLedger();
    return session;
  }

  async updateAgentState(sessionId: string, input: unknown, context: CloudLinkSessionRequestContext = {}): Promise<CloudLinkSession> {
    const session = this.requireSession(sessionId);
    const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const nextState = normalizeAgentState(record.state ?? record.agentState);
    if (!nextState) throw new Error("state must be one of idle, working, blocked, needs_approval, or done.");
    const actor = normalizeActor(context.actor);
    const previousState = session.agentState;
    session.agentState = nextState;
    session.lifecycle = nextState === "done" ? "running" : session.lifecycle === "stopped" ? "running" : session.lifecycle;
    const detail = normalizeOptionalString(record.detail ?? record.reason) || `Agent state changed to ${nextState}.`;
    const output = normalizeOptionalString(record.output);
    if (output) this.appendOutput(session, output.endsWith("\n") ? output : `${output}\n`);
    session.updatedAt = this.timestamp();
    this.events.push(this.event(session.id, "session.state_changed", detail, actor, {
      previousState,
      state: nextState,
    }));
    this.auditLogger?.record({
      actorId: actor.id,
      surface: context.surface ?? "session-daemon-api",
      eventType: "session_daemon.state_changed",
      action: "update_agent_state",
      target: session.id,
      metadata: { previousState, state: nextState },
    });
    await this.maybeNotifyState(session, previousState, { ...context, actor }, detail);
    this.persistLedger();
    return session;
  }

  async stopSession(sessionId: string, context: CloudLinkSessionRequestContext = {}): Promise<CloudLinkSession> {
    const session = this.requireSession(sessionId);
    const actor = normalizeActor(context.actor);
    const result = await this.runner.stop({ session, context: { ...context, actor } });
    applyRunnerResult(session, result);
    if (result.output) this.appendOutput(session, result.output);
    session.lifecycle = result.lifecycle ?? "stopped";
    session.updatedAt = this.timestamp();
    this.events.push(this.event(session.id, "session.stopped", "Cloud Link session stop requested.", actor));
    this.auditLogger?.record({
      actorId: actor.id,
      surface: context.surface ?? "session-daemon-api",
      eventType: "session_daemon.session_stopped",
      action: "stop_session",
      target: session.id,
      metadata: { lifecycle: session.lifecycle },
    });
    this.persistLedger();
    return session;
  }

  requestAttach(sessionId: string, input: unknown = {}, context: CloudLinkSessionRequestContext = {}): CloudLinkSessionAttachRequest {
    const session = this.requireSession(sessionId);
    const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const actor = normalizeActor(context.actor);
    const now = this.timestamp();
    const attachRequest: CloudLinkSessionAttachRequest = {
      id: `attach-${this.idGenerator()}`,
      sessionId: session.id,
      clientLabel: normalizeOptionalString(record.clientLabel ?? record.client_label) || "Cloud Link client",
      clientKind: normalizeAttachClientKind(record.clientKind ?? record.client_kind),
      status: "pending",
      requestedBy: actor,
      oneTimeCode: this.idGenerator().replace(/[^a-zA-Z0-9]/g, "").slice(0, 12),
      expiresAt: new Date(this.now().getTime() + this.attachRequestTtlMs).toISOString(),
      createdAt: now,
      updatedAt: now,
    };
    session.attachRequests.push(attachRequest);
    session.updatedAt = now;
    this.events.push(this.event(session.id, "attach.requested", `Attach requested from ${attachRequest.clientLabel}.`, actor, {
      clientKind: attachRequest.clientKind,
      expiresAt: attachRequest.expiresAt,
    }, attachRequest.id));
    this.auditLogger?.record({
      actorId: actor.id,
      surface: context.surface ?? "session-daemon-api",
      eventType: "session_daemon.attach_requested",
      action: "request_attach",
      target: session.id,
      metadata: {
        attachRequestId: attachRequest.id,
        clientKind: attachRequest.clientKind,
      },
    });
    this.persistLedger();
    return attachRequest;
  }

  approveAttach(sessionId: string, attachRequestId: string, input: unknown = {}, context: CloudLinkSessionRequestContext = {}): CloudLinkSessionAttachRequest {
    const session = this.requireSession(sessionId);
    const attachRequest = requireAttachRequest(session, attachRequestId);
    this.expireAttachRequests();
    if (attachRequest.status !== "pending") throw new Error(`Attach request is ${attachRequest.status}.`);
    const actor = normalizeActor(context.actor);
    attachRequest.status = "approved";
    attachRequest.approvedBy = actor;
    attachRequest.reason = normalizeOptionalString((input as { reason?: unknown })?.reason) || undefined;
    attachRequest.updatedAt = this.timestamp();
    session.updatedAt = attachRequest.updatedAt;
    this.events.push(this.event(session.id, "attach.approved", "Attach request approved.", actor, {}, attachRequest.id));
    this.auditLogger?.record({
      actorId: actor.id,
      surface: context.surface ?? "session-daemon-api",
      eventType: "session_daemon.attach_approved",
      action: "approve_attach",
      target: session.id,
      metadata: { attachRequestId: attachRequest.id },
    });
    this.persistLedger();
    return attachRequest;
  }

  denyAttach(sessionId: string, attachRequestId: string, input: unknown = {}, context: CloudLinkSessionRequestContext = {}): CloudLinkSessionAttachRequest {
    const session = this.requireSession(sessionId);
    const attachRequest = requireAttachRequest(session, attachRequestId);
    this.expireAttachRequests();
    if (attachRequest.status !== "pending") throw new Error(`Attach request is ${attachRequest.status}.`);
    const actor = normalizeActor(context.actor);
    attachRequest.status = "denied";
    attachRequest.deniedBy = actor;
    attachRequest.reason = normalizeOptionalString((input as { reason?: unknown })?.reason) || undefined;
    attachRequest.updatedAt = this.timestamp();
    session.updatedAt = attachRequest.updatedAt;
    this.events.push(this.event(session.id, "attach.denied", attachRequest.reason || "Attach request denied.", actor, {}, attachRequest.id));
    this.auditLogger?.record({
      actorId: actor.id,
      surface: context.surface ?? "session-daemon-api",
      eventType: "session_daemon.attach_denied",
      action: "deny_attach",
      target: session.id,
      metadata: { attachRequestId: attachRequest.id },
    });
    this.persistLedger();
    return attachRequest;
  }

  toHttpHandler(options: CloudLinkSessionHttpOptions = {}): (request: IncomingMessage, response: ServerResponse) => void {
    return createCloudLinkSessionHttpHandler(this, options);
  }

  private requireSession(sessionId: string): CloudLinkSession {
    const session = this.sessions.get(normalizeSessionId(sessionId));
    if (!session) throw new Error("Session not found.");
    return session;
  }

  private async maybeNotifyState(
    session: CloudLinkSession,
    previousState: CloudLinkSessionAgentState | undefined,
    context: CloudLinkSessionRequestContext,
    detail = "",
  ): Promise<void> {
    const sms = session.notifications.sms;
    if (!sms?.enabled) return;
    if (session.agentState === previousState) return;
    if (!sms.onStates.includes(session.agentState)) return;
    if (session.notificationState.smsLastState === session.agentState) return;
    if (!context.telnyxApiKey) {
      const message = "TELNYX_API_KEY was not available for per-user SMS notification.";
      session.notificationState.smsLastError = message;
      this.events.push(this.event(session.id, "notification.sms_skipped", message, normalizeActor(context.actor), {
        state: session.agentState,
      }));
      return;
    }
    try {
      const result = await this.smsAdapter.sendSms({
        apiKey: context.telnyxApiKey,
        from: sms.from,
        to: sms.to,
        text: renderSessionSms(session, detail),
        session,
        state: session.agentState,
      });
      session.notificationState.smsLastState = session.agentState;
      session.notificationState.smsLastAt = this.timestamp();
      session.notificationState.smsLastError = undefined;
      this.events.push(this.event(session.id, "notification.sms_sent", "Telnyx SMS notification sent.", normalizeActor(context.actor), {
        state: session.agentState,
        providerMessageId: result.externalId,
        providerUrl: result.externalUrl,
      }));
    } catch (error) {
      session.notificationState.smsLastError = errorMessage(error);
      this.events.push(this.event(session.id, "notification.sms_failed", session.notificationState.smsLastError, normalizeActor(context.actor), {
        state: session.agentState,
      }));
    }
  }

  private appendOutput(session: CloudLinkSession, text: string): void {
    session.output = `${session.output}${text}`.slice(-this.outputRetentionBytes);
  }

  private event(
    sessionId: string,
    type: CloudLinkSessionEventType,
    detail: string,
    actor?: CloudLinkSessionActor,
    metadata: Record<string, unknown> = {},
    attachRequestId?: string,
  ): CloudLinkSessionEvent {
    return {
      id: `event-${this.idGenerator()}`,
      sessionId,
      type,
      detail,
      ...(actor ? { actor } : {}),
      ...(attachRequestId ? { attachRequestId } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      createdAt: this.timestamp(),
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private loadStoredLedger(): { sessions: CloudLinkSession[]; events: CloudLinkSessionEvent[]; idempotency: [string, string][] } {
    if (!this.storagePath || !existsSync(this.storagePath)) return { sessions: [], events: [], idempotency: [] };
    const payload = JSON.parse(readFileSync(this.storagePath, "utf8")) as StoredCloudLinkSessionLedger;
    return {
      sessions: Array.isArray(payload.sessions) ? payload.sessions.map(normalizeStoredSession).filter(Boolean) as CloudLinkSession[] : [],
      events: Array.isArray(payload.events) ? payload.events.map(normalizeStoredEvent).filter(Boolean) as CloudLinkSessionEvent[] : [],
      idempotency: Array.isArray(payload.idempotency)
        ? payload.idempotency.map(normalizeStoredIdempotency).filter(Boolean) as [string, string][]
        : [],
    };
  }

  private persistLedger(): void {
    if (!this.storagePath) return;
    mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const temporaryPath = `${this.storagePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({
      sessions: [...this.sessions.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      events: this.events.slice(-20_000),
      idempotency: [...this.idempotency.entries()],
    }, null, 2));
    renameSync(temporaryPath, this.storagePath);
  }

  private expireAttachRequests(): void {
    const nowMs = this.now().getTime();
    let changed = false;
    for (const session of this.sessions.values()) {
      for (const attachRequest of session.attachRequests) {
        if (attachRequest.status !== "pending" || Date.parse(attachRequest.expiresAt) > nowMs) continue;
        attachRequest.status = "expired";
        attachRequest.updatedAt = this.timestamp();
        session.updatedAt = attachRequest.updatedAt;
        changed = true;
      }
    }
    if (changed) this.persistLedger();
  }
}

export class RecordOnlyCloudLinkSessionRunner implements CloudLinkSessionRunner {
  readonly mode = "record-only";

  async start(request: CloudLinkSessionRunnerStartRequest): Promise<CloudLinkSessionRunnerResult> {
    return {
      externalId: `record:${request.session.id}`,
      output: [
        `Cloud Link Session ${request.session.title} accepted by record-only runner.`,
        request.session.command ? `Command queued: ${request.session.command}` : "No startup command configured.",
        "",
      ].join("\n"),
      lifecycle: "running",
      agentState: request.session.command ? "working" : "idle",
    };
  }

  async sendInput(request: CloudLinkSessionRunnerInputRequest): Promise<CloudLinkSessionRunnerResult> {
    return {
      output: `record-only runner received input: ${request.text}\n`,
      lifecycle: "running",
      agentState: "working",
    };
  }

  async stop(): Promise<CloudLinkSessionRunnerResult> {
    return {
      output: "[record-only runner stopped session]\n",
      lifecycle: "stopped",
      agentState: "done",
    };
  }

  checkReadiness(): CloudLinkSessionReadinessCheck[] {
    return [{
      name: "Telnyx-hosted PTY runner configured",
      ok: false,
      detail: "record-only runner is active; configure the production runner on Telnyx servers",
    }];
  }
}

export class TelnyxHostedSessionRunner implements CloudLinkSessionRunner {
  readonly mode = "telnyx-hosted";
  private readonly runnerUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { runnerUrl: string; fetchImpl?: typeof fetch }) {
    this.runnerUrl = options.runnerUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async start(request: CloudLinkSessionRunnerStartRequest): Promise<CloudLinkSessionRunnerResult> {
    const payload = await this.requestJson("/sessions", {
      method: "POST",
      headers: this.headers(request.context),
      body: JSON.stringify({
        session_id: request.session.id,
        title: request.session.title,
        cwd: request.session.cwd,
        command: request.session.command,
        agent: request.session.agent,
        repository: request.session.repository,
        metadata: request.session.metadata,
      }),
    });
    return runnerResultFromPayload(payload);
  }

  async sendInput(request: CloudLinkSessionRunnerInputRequest): Promise<CloudLinkSessionRunnerResult> {
    const runnerId = request.session.runner.externalId || request.session.id;
    const payload = await this.requestJson(`/sessions/${encodeURIComponent(runnerId)}/input`, {
      method: "POST",
      headers: this.headers(request.context),
      body: JSON.stringify({ text: request.text }),
    });
    return runnerResultFromPayload(payload);
  }

  async stop(request: CloudLinkSessionRunnerStopRequest): Promise<CloudLinkSessionRunnerResult> {
    const runnerId = request.session.runner.externalId || request.session.id;
    const payload = await this.requestJson(`/sessions/${encodeURIComponent(runnerId)}/stop`, {
      method: "POST",
      headers: this.headers(request.context),
      body: JSON.stringify({}),
    });
    return runnerResultFromPayload(payload);
  }

  checkReadiness(): CloudLinkSessionReadinessCheck[] {
    return [{
      name: "Telnyx-hosted PTY runner configured",
      ok: Boolean(this.runnerUrl),
      detail: this.runnerUrl
        ? `runner URL configured at ${this.runnerUrl}`
        : "LINK_SESSION_RUNNER_URL or --runner-url is required for production PTY ownership",
    }];
  }

  private async requestJson(pathname: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${this.runnerUrl}${pathname}`, init);
    const text = await response.text();
    const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (!response.ok) throw new Error(`Telnyx-hosted session runner rejected request (${response.status}): ${text}`);
    return payload;
  }

  private headers(context: CloudLinkSessionRequestContext): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };
    if (context.bearerToken) headers.authorization = `Bearer ${context.bearerToken}`;
    if (context.telnyxApiKey) headers["x-telnyx-api-key"] = context.telnyxApiKey;
    const actor = normalizeActor(context.actor);
    if (actor.id && actor.id !== "anonymous") headers["x-telnyx-actor"] = actor.id;
    if (actor.displayName) headers["x-telnyx-actor-name"] = actor.displayName;
    if (actor.email) headers["x-telnyx-actor-email"] = actor.email;
    if (context.onBehalfOf) headers["x-on-behalf-of"] = context.onBehalfOf;
    if (context.groups?.length) headers["x-telnyx-groups"] = context.groups.join(",");
    return headers;
  }
}

export class RecordOnlyCloudLinkSmsAdapter implements CloudLinkSmsNotificationAdapter {
  readonly mode = "record-only";
  readonly sent: CloudLinkSmsNotificationRequest[] = [];

  async sendSms(request: CloudLinkSmsNotificationRequest): Promise<CloudLinkSmsNotificationResult> {
    this.sent.push(request);
    return {
      externalId: `record-sms:${request.session.id}:${request.state}`,
      metadata: { to: request.to, from: request.from },
    };
  }

  checkReadiness(): CloudLinkSessionReadinessCheck[] {
    return [{
      name: "Telnyx SMS adapter configured",
      ok: false,
      detail: "record-only SMS adapter is active; use TelnyxSmsNotificationAdapter for production",
    }];
  }
}

export class TelnyxSmsNotificationAdapter implements CloudLinkSmsNotificationAdapter {
  readonly mode = "telnyx-sms";
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { apiBaseUrl?: string; fetchImpl?: typeof fetch } = {}) {
    this.apiBaseUrl = (options.apiBaseUrl || "https://api.telnyx.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendSms(request: CloudLinkSmsNotificationRequest): Promise<CloudLinkSmsNotificationResult> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}/v2/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${request.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        from: request.from,
        to: request.to,
        text: request.text,
      }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const errors = Array.isArray(payload.errors) ? payload.errors.map((error) => normalizeOptionalString((error as { detail?: unknown }).detail)).filter(Boolean).join("; ") : "";
      throw new Error(errors || `Telnyx Messages API returned ${response.status}.`);
    }
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
    return {
      externalId: normalizeOptionalString(data.id) || `telnyx:${request.session.id}:${request.state}`,
      metadata: { statusCode: response.status },
    };
  }

  checkReadiness(): CloudLinkSessionReadinessCheck[] {
    return [{
      name: "Telnyx SMS adapter configured",
      ok: true,
      detail: "SMS notifications use the authenticated user's TELNYX_API_KEY per request; no API key is stored by the session daemon",
    }];
  }
}

export function createCloudLinkSessionHttpHandler(
  service = new CloudLinkSessionService(),
  options: CloudLinkSessionHttpOptions = {},
): (request: IncomingMessage, response: ServerResponse) => void {
  const requireAuth = options.requireAuth ?? true;
  const requireAuthContext = Boolean(options.requireAuthContext);
  return (request, response) => {
    void handleCloudLinkSessionRequest(service, request, response, { requireAuth, requireAuthContext });
  };
}

export function createCloudLinkSessionServer(
  service = new CloudLinkSessionService(),
  options: CloudLinkSessionHttpOptions = {},
): Server {
  return createServer(createCloudLinkSessionHttpHandler(service, options));
}

export async function listenCloudLinkSessionServer(
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

async function handleCloudLinkSessionRequest(
  service: CloudLinkSessionService,
  request: IncomingMessage,
  response: ServerResponse,
  options: Required<CloudLinkSessionHttpOptions>,
): Promise<void> {
  sessionDaemonHttpRequestsTotal += 1;
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      sendJson(response, 200, { ok: true, service: "link-session-daemon" });
      return;
    }
    if (request.method === "GET" && request.url === "/readyz") {
      const readiness = withHttpReadinessChecks(service.readiness(), options);
      sendJson(response, readiness.ready ? 200 : 503, readiness);
      return;
    }
    if (request.method === "GET" && request.url === "/metrics") {
      sendText(response, 200, "text/plain; version=0.0.4; charset=utf-8", sessionDaemonMetricsText());
      return;
    }
    if (options.requireAuth && !isAuthorizedSessionRequest(request, options.requireAuthContext)) {
      sendJson(response, 401, {
        error: options.requireAuthContext
          ? "Cloud Link Session Daemon requires auth plus Telnyx actor or group context."
          : "Cloud Link Session Daemon requires Okta Rev2 auth or TELNYX_API_KEY.",
      });
      return;
    }

    const url = new URL(request.url ?? "/", "http://link-session-daemon.internal");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const context = contextFromRequest(request);

    if (request.method === "POST" && parts.length === 1 && parts[0] === "sessions") {
      const session = await service.createSession(await readJson(request) as CloudLinkSessionInput, context);
      sendJson(response, 202, { session });
      return;
    }
    if (request.method === "GET" && parts.length === 1 && parts[0] === "sessions") {
      sendJson(response, 200, {
        sessions: service.listSessions({
          state: url.searchParams.get("state") ?? undefined,
          owner: url.searchParams.get("owner") ?? undefined,
        }),
      });
      return;
    }
    if (request.method === "GET" && parts.length === 2 && parts[0] === "sessions") {
      const session = service.getSession(parts[1]);
      sendJson(response, session ? 200 : 404, session ? { session } : { error: "Session not found." });
      return;
    }
    if (request.method === "GET" && parts.length === 3 && parts[0] === "sessions" && parts[2] === "events") {
      if (!service.getSession(parts[1])) {
        sendJson(response, 404, { error: "Session not found." });
        return;
      }
      sendJson(response, 200, { events: service.listEvents(parts[1]) });
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "sessions" && parts[2] === "input") {
      const input = await readJson(request) as { text?: unknown };
      sendJson(response, 202, { session: await service.sendInput(parts[1], input.text, context) });
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "sessions" && parts[2] === "state") {
      sendJson(response, 202, { session: await service.updateAgentState(parts[1], await readJson(request), context) });
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "sessions" && parts[2] === "stop") {
      sendJson(response, 202, { session: await service.stopSession(parts[1], context) });
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "sessions" && parts[2] === "attach-requests") {
      sendJson(response, 202, { attachRequest: service.requestAttach(parts[1], await readJson(request), context) });
      return;
    }
    if (request.method === "POST" && parts.length === 5 && parts[0] === "sessions" && parts[2] === "attach-requests" && parts[4] === "approve") {
      sendJson(response, 202, { attachRequest: service.approveAttach(parts[1], parts[3], await readJson(request), context) });
      return;
    }
    if (request.method === "POST" && parts.length === 5 && parts[0] === "sessions" && parts[2] === "attach-requests" && parts[4] === "deny") {
      sendJson(response, 202, { attachRequest: service.denyAttach(parts[1], parts[3], await readJson(request), context) });
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 400, { error: errorMessage(error) });
  }
}

function withHttpReadinessChecks(
  readiness: CloudLinkSessionReadiness,
  options: Required<CloudLinkSessionHttpOptions>,
): CloudLinkSessionReadiness {
  const checks = [
    ...readiness.checks,
    {
      name: "Session daemon auth required",
      ok: options.requireAuth,
      detail: options.requireAuth ? "auth is required for session daemon API requests" : "production daemon must not run with --dev-no-auth",
    },
    {
      name: "Authenticated actor context enforced",
      ok: options.requireAuth && options.requireAuthContext,
      detail: options.requireAuthContext
        ? "actor or group context is required for audited session control"
        : "set LINK_SESSION_DAEMON_REQUIRE_AUTH_CONTEXT=1 or --require-auth-context",
    },
  ];
  return {
    ...readiness,
    ready: checks.every((check) => check.ok),
    checks,
  };
}

function sessionDaemonMetricsText(): string {
  const uptimeSeconds = Math.max(0, (Date.now() - sessionDaemonMetricsStartedAt) / 1000);
  return [
    "# HELP link_session_daemon_up Cloud Link Session Daemon process health.",
    "# TYPE link_session_daemon_up gauge",
    "link_session_daemon_up 1",
    "# HELP link_session_daemon_http_requests_total Total HTTP requests handled by Cloud Link Session Daemon.",
    "# TYPE link_session_daemon_http_requests_total counter",
    `link_session_daemon_http_requests_total ${sessionDaemonHttpRequestsTotal}`,
    "# HELP link_session_daemon_process_uptime_seconds Cloud Link Session Daemon process uptime in seconds.",
    "# TYPE link_session_daemon_process_uptime_seconds gauge",
    `link_session_daemon_process_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
    "",
  ].join("\n");
}

function isAuthorizedSessionRequest(request: IncomingMessage, requireAuthContext = false): boolean {
  const authorization = request.headers.authorization ?? "";
  const authenticated = authorization.startsWith("Bearer ") || Boolean(request.headers["x-telnyx-auth-rev2"] || request.headers["x-telnyx-api-key"]);
  if (!authenticated) return false;
  if (!requireAuthContext) return true;
  return Boolean(rawActorFromRequest(request) || headerString(request, "x-telnyx-groups") || headerString(request, "x-on-behalf-of"));
}

function contextFromRequest(request: IncomingMessage): CloudLinkSessionRequestContext {
  const authorization = headerString(request, "authorization");
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  return {
    actor: actorFromRequest(request),
    bearerToken,
    telnyxApiKey: headerString(request, "x-telnyx-api-key") || headerString(request, "x-link-user-telnyx-api-key"),
    groups: headerString(request, "x-telnyx-groups").split(",").map((item) => item.trim()).filter(Boolean),
    onBehalfOf: headerString(request, "x-on-behalf-of"),
    surface: headerString(request, "x-link-surface") || "session-daemon-api",
  };
}

function actorFromRequest(request: IncomingMessage): CloudLinkSessionActor {
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

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += bytes.byteLength;
    if (totalBytes > 512_000) throw new Error("Request body is too large.");
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

function normalizeActor(value: unknown): CloudLinkSessionActor {
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

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeNotifications(value: unknown): CloudLinkSessionNotificationSettings {
  const record = normalizeMetadata(value);
  const smsRecord = normalizeMetadata(record.sms);
  const smsEnabled = normalizeBoolean(smsRecord.enabled ?? record.sms_enabled ?? record.smsEnabled, Boolean(smsRecord.to || smsRecord.from));
  const to = normalizePhoneNumber(smsRecord.to ?? record.sms_to ?? record.smsTo);
  const from = normalizePhoneNumber(smsRecord.from ?? record.sms_from ?? record.smsFrom);
  const onStates = normalizeAgentStates(smsRecord.onStates ?? smsRecord.on_states ?? record.sms_on_states ?? record.smsOnStates);
  return {
    ...(smsEnabled || to || from ? {
      sms: {
        enabled: Boolean(smsEnabled && to && from),
        to,
        from,
        onStates: onStates.length > 0 ? onStates : ["blocked", "needs_approval", "done"],
      },
    } : {}),
    ...(normalizeOptionalString(record.mobileUrl ?? record.mobile_url) ? { mobileUrl: normalizeOptionalString(record.mobileUrl ?? record.mobile_url) } : {}),
  };
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const text = normalizeOptionalString(value).toLowerCase();
  if (text === "1" || text === "true" || text === "yes") return true;
  if (text === "0" || text === "false" || text === "no") return false;
  return fallback;
}

function normalizePhoneNumber(value: unknown): string {
  const text = normalizeOptionalString(value);
  return /^\+[1-9]\d{6,14}$/.test(text) ? text : "";
}

function normalizeAgentStates(value: unknown): CloudLinkSessionAgentState[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  return [...new Set(values.map(normalizeAgentState).filter(Boolean))] as CloudLinkSessionAgentState[];
}

function normalizeAgentState(value: unknown): CloudLinkSessionAgentState | "" {
  const text = normalizeOptionalString(value).toLowerCase().replace(/[-\s]+/g, "_");
  if (text === "idle" || text === "working" || text === "blocked" || text === "needs_approval" || text === "done") return text;
  return "";
}

function normalizeLifecycle(value: unknown): CloudLinkSessionLifecycle {
  const text = normalizeOptionalString(value);
  if (text === "starting" || text === "running" || text === "stopped" || text === "failed") return text;
  return "running";
}

function normalizeAttachStatus(value: unknown): CloudLinkSessionAttachStatus {
  const text = normalizeOptionalString(value);
  if (text === "pending" || text === "approved" || text === "denied" || text === "expired") return text;
  return "pending";
}

function normalizeAttachClientKind(value: unknown): CloudLinkSessionAttachRequest["clientKind"] {
  const text = normalizeOptionalString(value).toLowerCase();
  if (text === "desktop" || text === "mobile" || text === "cli" || text === "api") return text;
  return "api";
}

function normalizeSessionId(value: unknown): string {
  return normalizeOptionalString(value).replace(/[^a-zA-Z0-9:_./-]/g, "").slice(0, 128);
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireAttachRequest(session: CloudLinkSession, attachRequestId: string): CloudLinkSessionAttachRequest {
  const attachRequest = session.attachRequests.find((item) => item.id === normalizeSessionId(attachRequestId));
  if (!attachRequest) throw new Error("Attach request not found.");
  return attachRequest;
}

function applyRunnerResult(session: CloudLinkSession, result: CloudLinkSessionRunnerResult): void {
  if (result.lifecycle) session.lifecycle = result.lifecycle;
  if (result.agentState) session.agentState = result.agentState;
  if (result.externalId) session.runner.externalId = result.externalId;
  if (result.attachUrl) session.runner.attachUrl = result.attachUrl;
  if (result.metadata) session.metadata = { ...session.metadata, runner: result.metadata };
}

function runnerResultFromPayload(payload: Record<string, unknown>): CloudLinkSessionRunnerResult {
  const record = normalizeMetadata(payload.runner ?? payload.session ?? payload);
  const lifecycleText = normalizeOptionalString(record.lifecycle);
  return {
    externalId: normalizeOptionalString(record.externalId ?? record.external_id ?? record.id) || undefined,
    attachUrl: normalizeOptionalString(record.attachUrl ?? record.attach_url) || undefined,
    output: normalizeOptionalString(record.output ?? record.buffer) || undefined,
    lifecycle: lifecycleText ? normalizeLifecycle(lifecycleText) : undefined,
    agentState: normalizeAgentState(record.agentState ?? record.agent_state) || undefined,
    metadata: normalizeMetadata(record.metadata),
  };
}

function renderSessionSms(session: CloudLinkSession, detail = ""): string {
  const lines = [
    `Cloud Link session "${session.title}" is ${session.agentState.replace("_", " ")}.`,
    detail,
    session.notifications.mobileUrl ? `Open: ${session.notifications.mobileUrl}` : "",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 1500);
}

function normalizeStoredSession(value: unknown): CloudLinkSession | null {
  const record = normalizeMetadata(value);
  const id = normalizeSessionId(record.id);
  if (!id) return null;
  return {
    id,
    title: normalizeOptionalString(record.title) || "Cloud Link Session",
    cwd: normalizeOptionalString(record.cwd) || "/workspace",
    command: normalizeOptionalString(record.command) || undefined,
    agent: normalizeOptionalString(record.agent) || undefined,
    repository: normalizeOptionalString(record.repository) || undefined,
    owner: normalizeActor(record.owner),
    lifecycle: normalizeLifecycle(record.lifecycle),
    agentState: normalizeAgentState(record.agentState ?? record.agent_state) || "idle",
    output: normalizeOptionalString(record.output),
    runner: normalizeRunnerRef(record.runner),
    notifications: normalizeStoredNotifications(record.notifications),
    notificationState: normalizeNotificationState(record.notificationState ?? record.notification_state),
    metadata: normalizeMetadata(record.metadata),
    idempotencyKey: normalizeOptionalString(record.idempotencyKey ?? record.idempotency_key),
    attachRequests: Array.isArray(record.attachRequests) ? record.attachRequests.map(normalizeStoredAttachRequest).filter(Boolean) as CloudLinkSessionAttachRequest[] : [],
    lastError: normalizeOptionalString(record.lastError ?? record.last_error) || undefined,
    createdAt: normalizeOptionalString(record.createdAt ?? record.created_at) || new Date(0).toISOString(),
    updatedAt: normalizeOptionalString(record.updatedAt ?? record.updated_at) || new Date(0).toISOString(),
  };
}

function normalizeRunnerRef(value: unknown): CloudLinkSessionRunnerRef {
  const record = normalizeMetadata(value);
  return {
    mode: normalizeOptionalString(record.mode) || "unknown",
    externalId: normalizeOptionalString(record.externalId ?? record.external_id) || undefined,
    attachUrl: normalizeOptionalString(record.attachUrl ?? record.attach_url) || undefined,
    cwd: normalizeOptionalString(record.cwd) || undefined,
    command: normalizeOptionalString(record.command) || undefined,
  };
}

function normalizeStoredNotifications(value: unknown): CloudLinkSessionNotificationSettings {
  const normalized = normalizeNotifications(value);
  const record = normalizeMetadata(value);
  const sms = normalizeMetadata(record.sms);
  if (normalized.sms) {
    normalized.sms.enabled = Boolean(sms.enabled ?? normalized.sms.enabled);
  }
  return normalized;
}

function normalizeNotificationState(value: unknown): CloudLinkSession["notificationState"] {
  const record = normalizeMetadata(value);
  return {
    smsLastState: normalizeAgentState(record.smsLastState ?? record.sms_last_state) || undefined,
    smsLastAt: normalizeOptionalString(record.smsLastAt ?? record.sms_last_at) || undefined,
    smsLastError: normalizeOptionalString(record.smsLastError ?? record.sms_last_error) || undefined,
  };
}

function normalizeStoredAttachRequest(value: unknown): CloudLinkSessionAttachRequest | null {
  const record = normalizeMetadata(value);
  const id = normalizeSessionId(record.id);
  const sessionId = normalizeSessionId(record.sessionId ?? record.session_id);
  if (!id || !sessionId) return null;
  return {
    id,
    sessionId,
    clientLabel: normalizeOptionalString(record.clientLabel ?? record.client_label) || "Cloud Link client",
    clientKind: normalizeAttachClientKind(record.clientKind ?? record.client_kind),
    status: normalizeAttachStatus(record.status),
    requestedBy: normalizeActor(record.requestedBy ?? record.requested_by),
    approvedBy: record.approvedBy || record.approved_by ? normalizeActor(record.approvedBy ?? record.approved_by) : undefined,
    deniedBy: record.deniedBy || record.denied_by ? normalizeActor(record.deniedBy ?? record.denied_by) : undefined,
    reason: normalizeOptionalString(record.reason) || undefined,
    oneTimeCode: normalizeOptionalString(record.oneTimeCode ?? record.one_time_code),
    expiresAt: normalizeOptionalString(record.expiresAt ?? record.expires_at) || new Date(0).toISOString(),
    createdAt: normalizeOptionalString(record.createdAt ?? record.created_at) || new Date(0).toISOString(),
    updatedAt: normalizeOptionalString(record.updatedAt ?? record.updated_at) || new Date(0).toISOString(),
  };
}

function normalizeStoredEvent(value: unknown): CloudLinkSessionEvent | null {
  const record = normalizeMetadata(value);
  const id = normalizeSessionId(record.id);
  const sessionId = normalizeSessionId(record.sessionId ?? record.session_id);
  const type = normalizeSessionEventType(record.type);
  if (!id || !sessionId || !type) return null;
  return {
    id,
    sessionId,
    type,
    detail: normalizeOptionalString(record.detail),
    actor: record.actor ? normalizeActor(record.actor) : undefined,
    attachRequestId: normalizeSessionId(record.attachRequestId ?? record.attach_request_id) || undefined,
    metadata: normalizeMetadata(record.metadata),
    createdAt: normalizeOptionalString(record.createdAt ?? record.created_at) || new Date(0).toISOString(),
  };
}

function normalizeSessionEventType(value: unknown): CloudLinkSessionEventType | "" {
  const text = normalizeOptionalString(value);
  const allowed: CloudLinkSessionEventType[] = [
    "session.created",
    "session.started",
    "session.input_sent",
    "session.state_changed",
    "session.stopped",
    "session.failed",
    "attach.requested",
    "attach.approved",
    "attach.denied",
    "notification.sms_sent",
    "notification.sms_failed",
    "notification.sms_skipped",
    "session.idempotent_replay",
  ];
  return allowed.includes(text as CloudLinkSessionEventType) ? text as CloudLinkSessionEventType : "";
}

function normalizeStoredIdempotency(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const key = normalizeOptionalString(value[0]);
  const sessionId = normalizeSessionId(value[1]);
  return key && sessionId ? [key, sessionId] : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
