import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { AuditLogger, RiskLevel } from "./types.js";

const skillRegistryMetricsStartedAt = Date.now();
let skillRegistryHttpRequestsTotal = 0;

export type SkillRegistryEventType = "star" | "unstar" | "install" | "run" | "view";
export type ToolArtifactType = "skill" | "mcp_tool" | "link_app";
export type ToolCatalogVisibility = "private" | "squad" | "internal";
export type ToolCatalogStatus = "draft" | "reviewing" | "published" | "deprecated";

export interface SkillRegistryReadinessCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SkillRegistryReadiness {
  ready: boolean;
  service: "link-skill-registry";
  storage: {
    configured: boolean;
    path?: string;
  };
  checks: SkillRegistryReadinessCheck[];
}

export interface SkillRegistryStats {
  skillId: string;
  skillName?: string;
  source?: string;
  starCount: number;
  installCount: number;
  downloadCount: number;
  runCount: number;
  viewCount: number;
  starredByActor: boolean;
  installedByActor: boolean;
  updatedAt: string;
}

export interface ToolCatalogInput {
  tool_id?: unknown;
  toolId?: unknown;
  name?: unknown;
  description?: unknown;
  owner?: unknown;
  team?: unknown;
  audience?: unknown;
  artifact_type?: unknown;
  artifactType?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  tools_required?: unknown;
  toolsRequired?: unknown;
  risk_level?: unknown;
  riskLevel?: unknown;
  customer_safe?: unknown;
  customerSafe?: unknown;
  approval_required?: unknown;
  approvalRequired?: unknown;
  source_of_truth?: unknown;
  sourceOfTruth?: unknown;
  repeated_checks?: unknown;
  repeatedChecks?: unknown;
  human_checkpoints?: unknown;
  humanCheckpoints?: unknown;
  test_fixture?: unknown;
  testFixture?: unknown;
  reviewers?: unknown;
  version?: unknown;
  visibility?: unknown;
  source?: unknown;
  skill_markdown?: unknown;
  skillMarkdown?: unknown;
  checklist?: unknown;
}

export interface ToolCatalogVersion {
  version: string;
  submittedAt: string;
  submittedBy?: string;
  source?: string;
}

export interface ToolCatalogItem {
  toolId: string;
  name: string;
  description: string;
  owner: string;
  team: string;
  audience: string;
  artifactType: ToolArtifactType;
  inputs: string;
  outputs: string;
  toolsRequired: string[];
  riskLevel: RiskLevel;
  customerSafe: boolean;
  approvalRequired: boolean;
  sourceOfTruth: string;
  repeatedChecks: string;
  humanCheckpoints: string;
  testFixture: string;
  reviewers: string[];
  version: string;
  visibility: ToolCatalogVisibility;
  source: string;
  status: ToolCatalogStatus;
  skillMarkdown?: string;
  checklist?: string[];
  versions: ToolCatalogVersion[];
  stats: SkillRegistryStats;
  createdAt: string;
  updatedAt: string;
  deprecatedAt?: string;
}

export interface SkillRegistryEventInput {
  event_type?: unknown;
  eventType?: unknown;
  skill_name?: unknown;
  skillName?: unknown;
  source?: unknown;
  actor_id?: unknown;
  actorId?: unknown;
}

export interface SkillRegistryServiceOptions {
  auditLogger?: AuditLogger;
  idGenerator?: () => string;
  now?: () => Date;
  storagePath?: string;
}

export interface SkillRegistryHttpOptions {
  requireAuth?: boolean;
  requireAuthContext?: boolean;
}

interface StoredSkillRegistryRecord {
  skillId: string;
  skillName?: string;
  source?: string;
  starActorKeys: string[];
  installActorKeys: string[];
  runCount: number;
  viewCount: number;
  updatedAt: string;
}

interface StoredToolCatalogRecord extends Omit<ToolCatalogItem, "stats"> {}

interface SkillRegistryEvent {
  id: string;
  skillId: string;
  eventType: SkillRegistryEventType;
  actorKey: string;
  createdAt: string;
}

export class SkillRegistryService {
  private readonly records = new Map<string, StoredSkillRegistryRecord>();
  private readonly catalog = new Map<string, StoredToolCatalogRecord>();
  private readonly events: SkillRegistryEvent[] = [];
  private readonly auditLogger?: AuditLogger;
  private readonly idGenerator: () => string;
  private readonly now: () => Date;
  private readonly storagePath?: string;

  constructor(options: SkillRegistryServiceOptions = {}) {
    this.auditLogger = options.auditLogger;
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.storagePath = options.storagePath;
    const stored = this.loadStoredRegistry();
    for (const record of stored.records) {
      this.records.set(record.skillId, normalizeStoredRecord(record));
    }
    for (const record of stored.catalog) {
      this.catalog.set(record.toolId, normalizeStoredCatalogRecord(record));
    }
    this.events.push(...stored.events);
  }

  readiness(): SkillRegistryReadiness {
    const checks = [
      {
        name: "Registry storage configured",
        ok: Boolean(this.storagePath),
        detail: this.storagePath ? "persistent storage path configured" : "LINK_SKILL_REGISTRY_STORAGE or --storage is required for production",
      },
    ];
    return {
      ready: checks.every((check) => check.ok),
      service: "link-skill-registry",
      storage: {
        configured: Boolean(this.storagePath),
        path: this.storagePath,
      },
      checks,
    };
  }

  listSkills(actorId = "", skillIds: string[] = []): SkillRegistryStats[] {
    const actorKey = actorStorageKey(actorId);
    const allowed = new Set(skillIds.map(normalizeSkillId).filter(Boolean));
    return [...this.records.values()]
      .filter((record) => allowed.size === 0 || allowed.has(record.skillId))
      .map((record) => statsForRecord(record, actorKey))
      .sort((left, right) => left.skillId.localeCompare(right.skillId));
  }

  getSkill(skillId: string, actorId = ""): SkillRegistryStats {
    const record = this.records.get(normalizeRequiredSkillId(skillId)) ?? this.emptyRecord(skillId);
    return statsForRecord(record, actorStorageKey(actorId));
  }

  listCatalog(actorId = "", toolIds: string[] = []): ToolCatalogItem[] {
    const allowed = new Set(toolIds.map(normalizeSkillId).filter(Boolean));
    return [...this.catalog.values()]
      .filter((record) => allowed.size === 0 || allowed.has(record.toolId))
      .map((record) => catalogItemForRecord(record, this.getSkill(record.toolId, actorId)))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getCatalogItem(toolId: string, actorId = ""): ToolCatalogItem | undefined {
    const normalizedToolId = normalizeRequiredSkillId(toolId);
    const record = this.catalog.get(normalizedToolId);
    return record ? catalogItemForRecord(record, this.getSkill(normalizedToolId, actorId)) : undefined;
  }

  registerCatalogItem(input: ToolCatalogInput = {}, actorId = ""): ToolCatalogItem {
    const existingId = normalizeSkillId(input.tool_id ?? input.toolId);
    const existing = existingId ? this.catalog.get(existingId) : undefined;
    const now = this.timestamp();
    const record = normalizeCatalogInput(input, existing, now, actorId);
    this.catalog.set(record.toolId, record);
    this.records.set(record.toolId, {
      ...(this.records.get(record.toolId) ?? this.emptyRecord(record.toolId)),
      skillName: record.name,
      source: record.source,
      updatedAt: now,
    });
    this.persistRegistry();
    this.auditLogger?.record({
      actorId: actorId || "link-skill-registry",
      surface: "skill-registry-api",
      eventType: existing ? "tool_catalog.versioned" : "tool_catalog.published",
      action: existing ? "version" : "publish",
      target: record.toolId,
      metadata: {
        artifactType: record.artifactType,
        visibility: record.visibility,
        riskLevel: record.riskLevel,
        approvalRequired: record.approvalRequired,
      },
    });
    return catalogItemForRecord(record, this.getSkill(record.toolId, actorId));
  }

  deprecateCatalogItem(toolId: string, input: { notes?: unknown } = {}, actorId = ""): ToolCatalogItem {
    const normalizedToolId = normalizeRequiredSkillId(toolId);
    const existing = this.catalog.get(normalizedToolId);
    if (!existing) throw new Error(`Unknown catalog tool: ${normalizedToolId}`);
    const now = this.timestamp();
    const record: StoredToolCatalogRecord = {
      ...existing,
      status: "deprecated",
      updatedAt: now,
      deprecatedAt: now,
      versions: [
        ...existing.versions,
        {
          version: `${existing.version}-deprecated`,
          submittedAt: now,
          submittedBy: actorId || undefined,
          source: normalizeOptionalString(input.notes) || "Deprecated from Cloud Link Tool Studio.",
        },
      ],
    };
    this.catalog.set(normalizedToolId, record);
    this.persistRegistry();
    this.auditLogger?.record({
      actorId: actorId || "link-skill-registry",
      surface: "skill-registry-api",
      eventType: "tool_catalog.deprecated",
      action: "deprecate",
      target: normalizedToolId,
      metadata: { notes: normalizeOptionalString(input.notes) },
    });
    return catalogItemForRecord(record, this.getSkill(normalizedToolId, actorId));
  }

  recordEvent(skillId: string, input: SkillRegistryEventInput = {}, actorId = ""): SkillRegistryStats {
    const normalizedSkillId = normalizeRequiredSkillId(skillId);
    const eventType = normalizeEventType(input.event_type ?? input.eventType);
    const actorKey = actorStorageKey(normalizeOptionalString(input.actor_id ?? input.actorId) || actorId || "anonymous");
    const existing = this.records.get(normalizedSkillId) ?? this.emptyRecord(normalizedSkillId);
    const now = this.timestamp();
    const next: StoredSkillRegistryRecord = {
      ...existing,
      skillName: normalizeOptionalString(input.skill_name ?? input.skillName) || existing.skillName,
      source: normalizeOptionalString(input.source) || existing.source,
      starActorKeys: [...existing.starActorKeys],
      installActorKeys: [...existing.installActorKeys],
      updatedAt: now,
    };

    if (eventType === "star") {
      next.starActorKeys = addUnique(next.starActorKeys, actorKey);
    } else if (eventType === "unstar") {
      next.starActorKeys = next.starActorKeys.filter((item) => item !== actorKey);
    } else if (eventType === "install") {
      next.installActorKeys = addUnique(next.installActorKeys, actorKey);
    } else if (eventType === "run") {
      next.runCount += 1;
    } else if (eventType === "view") {
      next.viewCount += 1;
    }

    this.records.set(normalizedSkillId, next);
    this.events.push({
      id: `skill-event-${this.idGenerator()}`,
      skillId: normalizedSkillId,
      eventType,
      actorKey,
      createdAt: now,
    });
    this.persistRegistry();
    this.auditLogger?.record({
      actorId: actorId || "link-skill-registry",
      surface: "skill-registry-api",
      eventType: `skill.${eventType}`,
      action: eventType,
      target: normalizedSkillId,
      metadata: {
        source: next.source,
        skillName: next.skillName,
      },
    });
    return statsForRecord(next, actorKey);
  }

  toHttpHandler(options: SkillRegistryHttpOptions = {}): (request: IncomingMessage, response: ServerResponse) => void {
    return createSkillRegistryHttpHandler(this, options);
  }

  private emptyRecord(skillId: string): StoredSkillRegistryRecord {
    return {
      skillId: normalizeRequiredSkillId(skillId),
      starActorKeys: [],
      installActorKeys: [],
      runCount: 0,
      viewCount: 0,
      updatedAt: this.timestamp(),
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private loadStoredRegistry(): { records: StoredSkillRegistryRecord[]; catalog: StoredToolCatalogRecord[]; events: SkillRegistryEvent[] } {
    if (!this.storagePath || !existsSync(this.storagePath)) return { records: [], catalog: [], events: [] };
    const payload = JSON.parse(readFileSync(this.storagePath, "utf8")) as unknown;
    if (!payload || typeof payload !== "object") return { records: [], catalog: [], events: [] };
    const record = payload as { skills?: unknown; records?: unknown; catalog?: unknown; events?: unknown };
    const records = Array.isArray(record.skills) ? record.skills : Array.isArray(record.records) ? record.records : [];
    const catalog = Array.isArray(record.catalog) ? record.catalog.map(normalizeStoredCatalogRecord) : [];
    const events = Array.isArray(record.events) ? record.events.map(normalizeStoredEvent).filter(Boolean) as SkillRegistryEvent[] : [];
    return {
      records: records.map(normalizeStoredRecord),
      catalog,
      events,
    };
  }

  private persistRegistry(): void {
    if (!this.storagePath) return;
    mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const temporaryPath = `${this.storagePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({
      skills: this.listStoredRecords(),
      catalog: this.listStoredCatalogRecords(),
      events: this.events.slice(-5000),
    }, null, 2));
    renameSync(temporaryPath, this.storagePath);
  }

  private listStoredRecords(): StoredSkillRegistryRecord[] {
    return [...this.records.values()].sort((left, right) => left.skillId.localeCompare(right.skillId));
  }

  private listStoredCatalogRecords(): StoredToolCatalogRecord[] {
    return [...this.catalog.values()].sort((left, right) => left.toolId.localeCompare(right.toolId));
  }
}

export function createSkillRegistryHttpHandler(
  service = new SkillRegistryService(),
  options: SkillRegistryHttpOptions = {},
): (request: IncomingMessage, response: ServerResponse) => void {
  const requireAuth = options.requireAuth ?? true;
  const requireAuthContext = Boolean(options.requireAuthContext);
  return (request, response) => {
    void handleSkillRegistryRequest(service, request, response, { requireAuth, requireAuthContext });
  };
}

export function createSkillRegistryServer(
  service = new SkillRegistryService(),
  options: SkillRegistryHttpOptions = {},
): Server {
  return createServer(createSkillRegistryHttpHandler(service, options));
}

export async function listenSkillRegistryServer(
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

async function handleSkillRegistryRequest(
  service: SkillRegistryService,
  request: IncomingMessage,
  response: ServerResponse,
  options: Required<SkillRegistryHttpOptions>,
): Promise<void> {
  skillRegistryHttpRequestsTotal += 1;
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      sendJson(response, 200, { ok: true, service: "link-skill-registry" });
      return;
    }
    if (request.method === "GET" && request.url === "/readyz") {
      const readiness = withHttpReadinessChecks(service.readiness(), options);
      sendJson(response, readiness.ready ? 200 : 503, readiness);
      return;
    }
    if (request.method === "GET" && request.url === "/metrics") {
      sendText(response, 200, "text/plain; version=0.0.4; charset=utf-8", skillRegistryMetricsText());
      return;
    }
    if (options.requireAuth && !isAuthorizedSkillRegistryRequest(request, options.requireAuthContext)) {
      sendJson(response, 401, {
        error: options.requireAuthContext
          ? "Cloud Link Skill Registry requires auth plus Telnyx actor or group context."
          : "Cloud Link Skill Registry requires Okta Rev2 auth or TELNYX_API_KEY.",
      });
      return;
    }

    const url = new URL(request.url ?? "/", "http://link-skill-registry.internal");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const actorId = actorFromRequest(request);
    if (request.method === "GET" && parts.length === 1 && parts[0] === "skills") {
      sendJson(response, 200, { skills: service.listSkills(actorId, parseSkillIds(url.searchParams.get("ids"))) });
      return;
    }
    if (request.method === "GET" && parts.length === 1 && parts[0] === "catalog") {
      sendJson(response, 200, { tools: service.listCatalog(actorId, parseSkillIds(url.searchParams.get("ids"))) });
      return;
    }
    if (request.method === "POST" && parts.length === 1 && parts[0] === "catalog") {
      sendJson(response, 201, { tool: service.registerCatalogItem(await readJson(request) as ToolCatalogInput, actorId) });
      return;
    }
    if (request.method === "GET" && parts.length === 2 && parts[0] === "catalog") {
      const tool = service.getCatalogItem(parts[1], actorId);
      sendJson(response, tool ? 200 : 404, tool ? { tool } : { error: "Catalog tool not found." });
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "catalog" && parts[2] === "versions") {
      sendJson(response, 201, { tool: service.registerCatalogItem({ ...(await readJson(request) as object), toolId: parts[1] } as ToolCatalogInput, actorId) });
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "catalog" && parts[2] === "deprecations") {
      sendJson(response, 202, { tool: service.deprecateCatalogItem(parts[1], await readJson(request) as { notes?: unknown }, actorId) });
      return;
    }
    if (request.method === "GET" && parts.length === 2 && parts[0] === "skills") {
      sendJson(response, 200, { skill: service.getSkill(parts[1], actorId) });
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "skills" && parts[2] === "events") {
      sendJson(response, 202, { skill: service.recordEvent(parts[1], await readJson(request) as SkillRegistryEventInput, actorId) });
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}

function withHttpReadinessChecks(
  readiness: SkillRegistryReadiness,
  options: Required<SkillRegistryHttpOptions>,
): SkillRegistryReadiness {
  const checks = [
    ...readiness.checks,
    {
      name: "Registry auth required",
      ok: options.requireAuth,
      detail: options.requireAuth ? "auth is required for registry API requests" : "production registry must not run with --dev-no-auth",
    },
    {
      name: "Authenticated actor context enforced",
      ok: options.requireAuth && options.requireAuthContext,
      detail: options.requireAuthContext
        ? "actor or group context is required for unique stars and installs"
        : "set LINK_SKILL_REGISTRY_REQUIRE_AUTH_CONTEXT=1 or --require-auth-context",
    },
  ];
  return {
    ...readiness,
    ready: checks.every((check) => check.ok),
    checks,
  };
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

function skillRegistryMetricsText(): string {
  const uptimeSeconds = Math.max(0, (Date.now() - skillRegistryMetricsStartedAt) / 1000);
  return [
    "# HELP link_skill_registry_up Cloud Link Skill Registry process health.",
    "# TYPE link_skill_registry_up gauge",
    "link_skill_registry_up 1",
    "# HELP link_skill_registry_http_requests_total Total HTTP requests handled by Cloud Link Skill Registry.",
    "# TYPE link_skill_registry_http_requests_total counter",
    `link_skill_registry_http_requests_total ${skillRegistryHttpRequestsTotal}`,
    "# HELP link_skill_registry_process_uptime_seconds Cloud Link Skill Registry process uptime in seconds.",
    "# TYPE link_skill_registry_process_uptime_seconds gauge",
    `link_skill_registry_process_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
    "",
  ].join("\n");
}

function isAuthorizedSkillRegistryRequest(request: IncomingMessage, requireAuthContext = false): boolean {
  const authorization = request.headers.authorization ?? "";
  const authenticated = authorization.startsWith("Bearer ") || Boolean(request.headers["x-telnyx-auth-rev2"] || request.headers["x-telnyx-api-key"]);
  if (!authenticated) return false;
  if (!requireAuthContext) return true;
  return Boolean(actorFromRequest(request) || headerString(request, "x-telnyx-groups") || headerString(request, "x-on-behalf-of"));
}

function actorFromRequest(request: IncomingMessage): string {
  return headerString(request, "x-telnyx-actor") || headerString(request, "x-actor") || headerString(request, "x-telnyx-user");
}

function headerString(request: IncomingMessage, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(",") : value ?? "";
}

function parseSkillIds(value: string | null): string[] {
  return String(value || "")
    .split(",")
    .map(normalizeSkillId)
    .filter(Boolean);
}

function normalizeEventType(value: unknown): SkillRegistryEventType {
  const text = normalizeOptionalString(value);
  if (text === "star" || text === "unstar" || text === "install" || text === "run" || text === "view") return text;
  throw new Error("event_type must be one of star, unstar, install, run, or view.");
}

function normalizeRequiredSkillId(value: unknown): string {
  const normalized = normalizeSkillId(value);
  if (!normalized) throw new Error("skill_id is required.");
  return normalized;
}

function normalizeSkillId(value: unknown): string {
  return normalizeOptionalString(value)
    .toLowerCase()
    .replace(/[^a-z0-9:_./-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function actorStorageKey(actorId: string): string {
  return createHash("sha256").update(actorId || "anonymous").digest("hex");
}

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function statsForRecord(record: StoredSkillRegistryRecord, actorKey: string): SkillRegistryStats {
  return {
    skillId: record.skillId,
    skillName: record.skillName,
    source: record.source,
    starCount: record.starActorKeys.length,
    installCount: record.installActorKeys.length,
    downloadCount: record.installActorKeys.length,
    runCount: record.runCount,
    viewCount: record.viewCount,
    starredByActor: record.starActorKeys.includes(actorKey),
    installedByActor: record.installActorKeys.includes(actorKey),
    updatedAt: record.updatedAt,
  };
}

function catalogItemForRecord(record: StoredToolCatalogRecord, stats: SkillRegistryStats): ToolCatalogItem {
  return {
    ...record,
    stats,
  };
}

function normalizeCatalogInput(
  input: ToolCatalogInput,
  existing: StoredToolCatalogRecord | undefined,
  now: string,
  actorId: string,
): StoredToolCatalogRecord {
  const name = requiredCatalogString(input.name ?? existing?.name, "name");
  const artifactType = normalizeArtifactType(input.artifact_type ?? input.artifactType ?? existing?.artifactType);
  const source = normalizeOptionalString(input.source) || existing?.source || "tool-studio";
  const toolId = normalizeSkillId(input.tool_id ?? input.toolId) || existing?.toolId || `${slugifyId(source)}:${slugifyId(name)}`;
  if (!toolId) throw new Error("tool_id is required.");
  const riskLevel = normalizeRiskLevel(input.risk_level ?? input.riskLevel ?? existing?.riskLevel);
  const customerSafe = normalizeBoolean(input.customer_safe ?? input.customerSafe, existing?.customerSafe ?? false);
  const approvalInput = input.approval_required ?? input.approvalRequired;
  const approvalRequired = typeof approvalInput === "boolean"
    ? approvalInput
    : existing?.approvalRequired ?? defaultApprovalRequired({ artifactType, riskLevel, customerSafe });
  const version = normalizeOptionalString(input.version) || nextCatalogVersion(existing);
  const versionRecord: ToolCatalogVersion = {
    version,
    submittedAt: now,
    submittedBy: actorId || undefined,
    source,
  };

  return {
    toolId,
    name,
    description: requiredCatalogString(input.description ?? existing?.description, "description"),
    owner: requiredCatalogString(input.owner ?? existing?.owner, "owner"),
    team: requiredCatalogString(input.team ?? existing?.team, "team"),
    audience: normalizeOptionalString(input.audience) || existing?.audience || "Telnyx employees",
    artifactType,
    inputs: normalizeOptionalString(input.inputs) || existing?.inputs || "User prompt or selected chat context.",
    outputs: normalizeOptionalString(input.outputs) || existing?.outputs || "Reviewable bot output.",
    toolsRequired: normalizeStringArray(input.tools_required ?? input.toolsRequired ?? existing?.toolsRequired),
    riskLevel,
    customerSafe,
    approvalRequired,
    sourceOfTruth: normalizeOptionalString(input.source_of_truth ?? input.sourceOfTruth) || existing?.sourceOfTruth || "Git-backed Cloud Link tool definition.",
    repeatedChecks: normalizeOptionalString(input.repeated_checks ?? input.repeatedChecks) || existing?.repeatedChecks || "Run the included test fixture before sharing.",
    humanCheckpoints: normalizeOptionalString(input.human_checkpoints ?? input.humanCheckpoints) || existing?.humanCheckpoints || "Human owner reviews public or destructive actions.",
    testFixture: normalizeOptionalString(input.test_fixture ?? input.testFixture) || existing?.testFixture || "Use the latest real chat request as the fixture.",
    reviewers: normalizeStringArray(input.reviewers ?? existing?.reviewers),
    version,
    visibility: normalizeCatalogVisibility(input.visibility ?? existing?.visibility),
    source,
    status: normalizeCatalogStatus(existing?.status) === "deprecated" ? "reviewing" : normalizeCatalogStatus(existing?.status || "published"),
    skillMarkdown: normalizeOptionalString(input.skill_markdown ?? input.skillMarkdown) || existing?.skillMarkdown,
    checklist: normalizeStringArray(input.checklist ?? existing?.checklist),
    versions: [...(existing?.versions ?? []), versionRecord],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function normalizeStoredCatalogRecord(value: unknown): StoredToolCatalogRecord {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const now = new Date(0).toISOString();
  const name = requiredCatalogString(record.name, "name");
  const source = normalizeOptionalString(record.source) || "tool-studio";
  const version = normalizeOptionalString(record.version) || "1.0.0";
  return {
    toolId: normalizeRequiredSkillId(record.toolId ?? record.tool_id ?? `${slugifyId(source)}:${slugifyId(name)}`),
    name,
    description: requiredCatalogString(record.description, "description"),
    owner: requiredCatalogString(record.owner, "owner"),
    team: requiredCatalogString(record.team, "team"),
    audience: normalizeOptionalString(record.audience) || "Telnyx employees",
    artifactType: normalizeArtifactType(record.artifactType ?? record.artifact_type),
    inputs: normalizeOptionalString(record.inputs) || "User prompt or selected chat context.",
    outputs: normalizeOptionalString(record.outputs) || "Reviewable bot output.",
    toolsRequired: normalizeStringArray(record.toolsRequired ?? record.tools_required),
    riskLevel: normalizeRiskLevel(record.riskLevel ?? record.risk_level),
    customerSafe: normalizeBoolean(record.customerSafe ?? record.customer_safe, false),
    approvalRequired: normalizeBoolean(record.approvalRequired ?? record.approval_required, true),
    sourceOfTruth: normalizeOptionalString(record.sourceOfTruth ?? record.source_of_truth) || "Git-backed Cloud Link tool definition.",
    repeatedChecks: normalizeOptionalString(record.repeatedChecks ?? record.repeated_checks) || "Run the included test fixture before sharing.",
    humanCheckpoints: normalizeOptionalString(record.humanCheckpoints ?? record.human_checkpoints) || "Human owner reviews public or destructive actions.",
    testFixture: normalizeOptionalString(record.testFixture ?? record.test_fixture) || "Use the latest real chat request as the fixture.",
    reviewers: normalizeStringArray(record.reviewers),
    version,
    visibility: normalizeCatalogVisibility(record.visibility),
    source,
    status: normalizeCatalogStatus(record.status),
    skillMarkdown: normalizeOptionalString(record.skillMarkdown ?? record.skill_markdown) || undefined,
    checklist: normalizeStringArray(record.checklist),
    versions: normalizeCatalogVersions(record.versions, version),
    createdAt: normalizeOptionalString(record.createdAt ?? record.created_at) || now,
    updatedAt: normalizeOptionalString(record.updatedAt ?? record.updated_at) || now,
    deprecatedAt: normalizeOptionalString(record.deprecatedAt ?? record.deprecated_at) || undefined,
  };
}

function normalizeStoredRecord(value: unknown): StoredSkillRegistryRecord {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    skillId: normalizeRequiredSkillId(record.skillId ?? record.skill_id),
    skillName: normalizeOptionalString(record.skillName ?? record.skill_name) || undefined,
    source: normalizeOptionalString(record.source) || undefined,
    starActorKeys: normalizeStringArray(record.starActorKeys ?? record.star_actor_keys),
    installActorKeys: normalizeStringArray(record.installActorKeys ?? record.install_actor_keys),
    runCount: normalizeCount(record.runCount ?? record.run_count),
    viewCount: normalizeCount(record.viewCount ?? record.view_count),
    updatedAt: normalizeOptionalString(record.updatedAt ?? record.updated_at) || new Date(0).toISOString(),
  };
}

function normalizeStoredEvent(value: unknown): SkillRegistryEvent | null {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const skillId = normalizeSkillId(record.skillId ?? record.skill_id);
  const eventType = normalizeOptionalString(record.eventType ?? record.event_type);
  if (!skillId || !["star", "unstar", "install", "run", "view"].includes(eventType)) return null;
  return {
    id: normalizeOptionalString(record.id) || `skill-event-${randomUUID()}`,
    skillId,
    eventType: eventType as SkillRegistryEventType,
    actorKey: normalizeOptionalString(record.actorKey ?? record.actor_key) || actorStorageKey("anonymous"),
    createdAt: normalizeOptionalString(record.createdAt ?? record.created_at) || new Date(0).toISOString(),
  };
}

function normalizeStringArray(value: unknown): string[] {
  return [...new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [])];
}

function normalizeCount(value: unknown): number {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function normalizeArtifactType(value: unknown): ToolArtifactType {
  const text = normalizeOptionalString(value);
  if (text === "mcp_tool" || text === "link_app") return text;
  return "skill";
}

function normalizeCatalogVisibility(value: unknown): ToolCatalogVisibility {
  const text = normalizeOptionalString(value);
  if (text === "private" || text === "squad" || text === "internal") return text;
  return "squad";
}

function normalizeCatalogStatus(value: unknown): ToolCatalogStatus {
  const text = normalizeOptionalString(value);
  if (text === "draft" || text === "reviewing" || text === "published" || text === "deprecated") return text;
  return "published";
}

function normalizeRiskLevel(value: unknown): RiskLevel {
  const text = normalizeOptionalString(value);
  if (text === "low" || text === "medium" || text === "high") return text;
  return "medium";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeCatalogVersions(value: unknown, currentVersion: string): ToolCatalogVersion[] {
  const versions = Array.isArray(value)
    ? value.map((item): ToolCatalogVersion | null => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const version = normalizeOptionalString(record.version);
      if (!version) return null;
      const submittedBy = normalizeOptionalString(record.submittedBy ?? record.submitted_by);
      const source = normalizeOptionalString(record.source);
      return {
        version,
        submittedAt: normalizeOptionalString(record.submittedAt ?? record.submitted_at) || new Date(0).toISOString(),
        ...(submittedBy ? { submittedBy } : {}),
        ...(source ? { source } : {}),
      };
    }).filter((item): item is ToolCatalogVersion => Boolean(item))
    : [];
  return versions.length > 0 ? versions : [{ version: currentVersion, submittedAt: new Date(0).toISOString() }];
}

function requiredCatalogString(value: unknown, field: string): string {
  const text = normalizeOptionalString(value);
  if (!text) throw new Error(`tool catalog ${field} is required.`);
  return text;
}

function nextCatalogVersion(existing?: StoredToolCatalogRecord): string {
  if (!existing) return "1.0.0";
  const parts = existing.version.split(".").map((part) => Number.parseInt(part, 10));
  const major = Number.isInteger(parts[0]) ? parts[0]! : 1;
  const minor = Number.isInteger(parts[1]) ? parts[1]! : 0;
  const patch = Number.isInteger(parts[2]) ? parts[2]! : 0;
  return `${major}.${minor}.${patch + 1}`;
}

function defaultApprovalRequired({
  artifactType,
  riskLevel,
  customerSafe,
}: {
  artifactType: ToolArtifactType;
  riskLevel: RiskLevel;
  customerSafe: boolean;
}): boolean {
  return customerSafe || riskLevel === "high" || artifactType !== "skill";
}

function slugifyId(value: unknown): string {
  return normalizeSkillId(value) || "tool";
}
