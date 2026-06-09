import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AuditLogger, RiskLevel } from "./types.js";

export type LinkAppPublisherStatus = "submitted" | "building" | "preview" | "approved" | "rejected" | "deprecated";
export type LinkAppPublisherType = "web" | "mcp_app";
export type LinkAppPublisherDecision = "approve" | "reject";

export interface LinkAppPublisherVersion {
  id: string;
  appId: string;
  version: string;
  sourceRepo: string;
  sourceRef: string;
  sourceSubdir: string;
  status: LinkAppPublisherStatus;
  submittedAt: string;
  reviewedAt?: string;
  buildLogUrl?: string;
}

export interface LinkAppPublisherApp {
  id: string;
  name: string;
  slug: string;
  description: string;
  ownerSquad: string;
  audience: string;
  appType: LinkAppPublisherType;
  access: "vpn";
  riskLevel: RiskLevel;
  status: LinkAppPublisherStatus;
  sourceRepo: string;
  sourceRef: string;
  sourceSubdir: string;
  buildCommand: string;
  startCommand?: string;
  outputDir?: string;
  envSchema: string[];
  reviewers: string[];
  previewUrl?: string;
  deployedUrl?: string;
  vpnUrl?: string;
  latestVersion: LinkAppPublisherVersion;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkAppPublishIntentInput {
  app?: {
    name?: unknown;
    slug?: unknown;
    description?: unknown;
    owner_squad?: unknown;
    ownerSquad?: unknown;
    audience?: unknown;
    app_type?: unknown;
    appType?: unknown;
    access?: unknown;
    risk_level?: unknown;
    riskLevel?: unknown;
    env_schema?: unknown;
    envSchema?: unknown;
    reviewers?: unknown;
  };
  source?: {
    repo?: unknown;
    source_repo?: unknown;
    ref?: unknown;
    source_ref?: unknown;
    subdir?: unknown;
    source_subdir?: unknown;
  };
  build?: {
    command?: unknown;
    build_command?: unknown;
    start_command?: unknown;
    startCommand?: unknown;
    output_dir?: unknown;
    outputDir?: unknown;
  };
}

export interface LinkAppVersionInput {
  source_repo?: unknown;
  sourceRepo?: unknown;
  source_ref?: unknown;
  sourceRef?: unknown;
  source_subdir?: unknown;
  sourceSubdir?: unknown;
  notes?: unknown;
}

export interface LinkAppReviewInput {
  decision?: unknown;
  notes?: unknown;
  reviewer?: unknown;
}

export interface LinkAppPublisherMutationResult {
  mode: "managed";
  message: string;
  intent_id?: string;
  app: LinkAppPublisherApp;
  version?: LinkAppPublisherVersion;
  review?: {
    status: LinkAppPublisherStatus;
    reviewers: string[];
    notes?: string;
  };
}

export interface LinkAppDuplicateResult {
  mode: "managed";
  action: "source_ref";
  source_repo: string;
  source_ref: string;
  source_subdir: string;
  command: string;
  message: string;
}

export interface LinkAppPublisherServiceOptions {
  auditLogger?: AuditLogger;
  idGenerator?: () => string;
  now?: () => Date;
  previewBaseDomain?: string;
  vpnBaseDomain?: string;
  buildLogBaseUrl?: string;
}

export interface LinkAppPublisherHttpOptions {
  requireAuth?: boolean;
}

interface NormalizedPublishIntent {
  name: string;
  slug: string;
  description: string;
  ownerSquad: string;
  audience: string;
  appType: LinkAppPublisherType;
  riskLevel: RiskLevel;
  sourceRepo: string;
  sourceRef: string;
  sourceSubdir: string;
  buildCommand: string;
  startCommand?: string;
  outputDir?: string;
  envSchema: string[];
  reviewers: string[];
}

export class LinkAppPublisherService {
  private readonly apps = new Map<string, LinkAppPublisherApp>();
  private readonly auditLogger?: AuditLogger;
  private readonly idGenerator: () => string;
  private readonly now: () => Date;
  private readonly previewBaseDomain: string;
  private readonly vpnBaseDomain: string;
  private readonly buildLogBaseUrl: string;

  constructor(options: LinkAppPublisherServiceOptions = {}) {
    this.auditLogger = options.auditLogger;
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.previewBaseDomain = options.previewBaseDomain ?? "link-apps-preview.query.prod.telnyx.io";
    this.vpnBaseDomain = options.vpnBaseDomain ?? "apps.telnyx.io";
    this.buildLogBaseUrl = options.buildLogBaseUrl ?? "https://link-app-publisher.query.prod.telnyx.io/logs";
  }

  listApps(): LinkAppPublisherApp[] {
    return [...this.apps.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getApp(idOrSlug: string): LinkAppPublisherApp | undefined {
    return this.listApps().find((app) => app.id === idOrSlug || app.slug === idOrSlug);
  }

  createPublishIntent(input: LinkAppPublishIntentInput): LinkAppPublisherMutationResult {
    const intent = normalizePublishIntent(input);
    if (this.getApp(intent.slug)) {
      throw new Error(`App slug already exists: ${intent.slug}`);
    }

    const now = this.timestamp();
    const appId = `app-${intent.slug}`;
    const version = this.createVersionRecord(appId, intent.sourceRepo, intent.sourceRef, intent.sourceSubdir, "preview");
    const app: LinkAppPublisherApp = {
      id: appId,
      name: intent.name,
      slug: intent.slug,
      description: intent.description,
      ownerSquad: intent.ownerSquad,
      audience: intent.audience,
      appType: intent.appType,
      access: "vpn",
      riskLevel: intent.riskLevel,
      status: "preview",
      sourceRepo: intent.sourceRepo,
      sourceRef: intent.sourceRef,
      sourceSubdir: intent.sourceSubdir,
      buildCommand: intent.buildCommand,
      startCommand: intent.startCommand,
      outputDir: intent.outputDir,
      envSchema: intent.envSchema,
      reviewers: intent.reviewers,
      previewUrl: `https://${intent.slug}.${this.previewBaseDomain}`,
      latestVersion: version,
      createdAt: now,
      updatedAt: now,
    };

    this.apps.set(app.id, app);
    this.audit("link_app.publish_intent.created", "create_publish_intent", app.id, { slug: app.slug, status: app.status });
    return {
      mode: "managed",
      message: "Publish intent accepted. Preview is available for reviewer approval.",
      intent_id: `intent-${this.idGenerator()}`,
      app,
      version,
      review: { status: app.status, reviewers: app.reviewers },
    };
  }

  createVersion(appId: string, input: LinkAppVersionInput): LinkAppPublisherMutationResult {
    const app = this.requireApp(appId);
    const sourceRepo = normalizeRequiredString(input.source_repo ?? input.sourceRepo, "source_repo");
    assertSafeSourceRepo(sourceRepo);
    const sourceRef = normalizeOptionalString(input.source_ref ?? input.sourceRef) || "main";
    const sourceSubdir = normalizeOptionalString(input.source_subdir ?? input.sourceSubdir) || ".";
    const version = this.createVersionRecord(app.id, sourceRepo, sourceRef, sourceSubdir, "preview");
    const next: LinkAppPublisherApp = {
      ...app,
      status: "preview",
      sourceRepo,
      sourceRef,
      sourceSubdir,
      latestVersion: version,
      previewUrl: `https://${app.slug}.${this.previewBaseDomain}`,
      updatedAt: this.timestamp(),
    };
    this.apps.set(next.id, next);
    this.audit("link_app.version.created", "create_app_version", next.id, { sourceRef, sourceSubdir });
    return {
      mode: "managed",
      message: "Version request accepted. Preview is available for reviewer approval.",
      app: next,
      version,
      review: { status: next.status, reviewers: next.reviewers },
    };
  }

  reviewApp(appId: string, input: LinkAppReviewInput): LinkAppPublisherMutationResult {
    const app = this.requireApp(appId);
    const decision = normalizeReviewDecision(input.decision);
    const status: LinkAppPublisherStatus = decision === "approve" ? "approved" : "rejected";
    const now = this.timestamp();
    const reviewNotes = normalizeOptionalString(input.notes);
    const deployedUrl = status === "approved" ? `https://${app.slug}.${this.vpnBaseDomain}` : app.deployedUrl;
    const nextVersion: LinkAppPublisherVersion = {
      ...app.latestVersion,
      status,
      reviewedAt: now,
    };
    const next: LinkAppPublisherApp = {
      ...app,
      status,
      latestVersion: nextVersion,
      deployedUrl,
      vpnUrl: deployedUrl,
      reviewNotes,
      updatedAt: now,
    };
    this.apps.set(next.id, next);
    this.audit("link_app.reviewed", "review_app", next.id, {
      decision,
      reviewer: normalizeOptionalString(input.reviewer),
      status,
    });
    return {
      mode: "managed",
      message: `App ${status}.`,
      app: next,
      version: nextVersion,
      review: { status, reviewers: next.reviewers, notes: reviewNotes || undefined },
    };
  }

  duplicateApp(appId: string): LinkAppDuplicateResult {
    const app = this.requireApp(appId);
    this.audit("link_app.duplicated", "duplicate_app", app.id, { sourceRef: app.sourceRef });
    return {
      mode: "managed",
      action: "source_ref",
      source_repo: app.sourceRepo,
      source_ref: app.sourceRef,
      source_subdir: app.sourceSubdir,
      command: `git clone ${app.sourceRepo}`,
      message: "Use the source reference to duplicate or fork this app; local credential files are never bundled.",
    };
  }

  toHttpHandler(options: LinkAppPublisherHttpOptions = {}): (request: IncomingMessage, response: ServerResponse) => void {
    return createLinkAppPublisherHttpHandler(this, options);
  }

  private requireApp(appId: string): LinkAppPublisherApp {
    const app = this.getApp(appId);
    if (!app) throw new Error("Published app not found.");
    return app;
  }

  private createVersionRecord(
    appId: string,
    sourceRepo: string,
    sourceRef: string,
    sourceSubdir: string,
    status: LinkAppPublisherStatus,
  ): LinkAppPublisherVersion {
    const versionId = `version-${this.idGenerator()}`;
    return {
      id: versionId,
      appId,
      version: this.now().toISOString().slice(0, 10),
      sourceRepo,
      sourceRef,
      sourceSubdir,
      status,
      submittedAt: this.timestamp(),
      buildLogUrl: `${this.buildLogBaseUrl}/${encodeURIComponent(versionId)}`,
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private audit(eventType: string, action: string, target: string, metadata: Record<string, unknown>): void {
    this.auditLogger?.record({ actorId: "link-app-publisher", surface: "publisher-api", eventType, action, target, metadata });
  }
}

export function createLinkAppPublisherHttpHandler(
  service = new LinkAppPublisherService(),
  options: LinkAppPublisherHttpOptions = {},
): (request: IncomingMessage, response: ServerResponse) => void {
  const requireAuth = options.requireAuth ?? true;
  return (request, response) => {
    void handlePublisherRequest(service, request, response, requireAuth);
  };
}

export function createLinkAppPublisherServer(
  service = new LinkAppPublisherService(),
  options: LinkAppPublisherHttpOptions = {},
): Server {
  return createServer(createLinkAppPublisherHttpHandler(service, options));
}

export async function listenLinkAppPublisherServer(
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

async function handlePublisherRequest(
  service: LinkAppPublisherService,
  request: IncomingMessage,
  response: ServerResponse,
  requireAuth: boolean,
): Promise<void> {
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      sendJson(response, 200, { ok: true, service: "link-app-publisher" });
      return;
    }
    if (requireAuth && !isAuthorizedPublisherRequest(request)) {
      sendJson(response, 401, { error: "Link App Publisher requires Okta Rev2 auth or TELNYX_API_KEY." });
      return;
    }

    const url = new URL(request.url ?? "/", "http://link-app-publisher.internal");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (request.method === "GET" && parts.length === 1 && parts[0] === "apps") {
      sendJson(response, 200, { apps: service.listApps() });
      return;
    }
    if (request.method === "GET" && parts.length === 2 && parts[0] === "apps") {
      const app = service.getApp(parts[1]);
      if (!app) {
        sendJson(response, 404, { error: "Published app not found." });
        return;
      }
      sendJson(response, 200, { app });
      return;
    }
    if (request.method === "POST" && parts.length === 1 && parts[0] === "publish-intents") {
      sendJson(response, 202, service.createPublishIntent((await readJson(request)) as LinkAppPublishIntentInput));
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "apps" && parts[2] === "versions") {
      sendJson(response, 202, service.createVersion(parts[1], (await readJson(request)) as LinkAppVersionInput));
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "apps" && parts[2] === "reviews") {
      sendJson(response, 200, service.reviewApp(parts[1], (await readJson(request)) as LinkAppReviewInput));
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "apps" && parts[2] === "duplicate") {
      sendJson(response, 200, service.duplicateApp(parts[1]));
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
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

function isAuthorizedPublisherRequest(request: IncomingMessage): boolean {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") || Boolean(request.headers["x-telnyx-auth-rev2"] || request.headers["x-telnyx-api-key"]);
}

function normalizePublishIntent(input: LinkAppPublishIntentInput): NormalizedPublishIntent {
  const app = input.app ?? {};
  const source = input.source ?? {};
  const build = input.build ?? {};
  const name = normalizeRequiredString(app.name, "name");
  const slug = slugify(normalizeOptionalString(app.slug) || name);
  const appType = normalizeAppType(app.app_type ?? app.appType);
  const riskLevel = normalizeRiskLevel(app.risk_level ?? app.riskLevel);
  const sourceRepo = normalizeRequiredString(source.repo ?? source.source_repo, "source_repo");
  assertSafeSourceRepo(sourceRepo);
  if (normalizeOptionalString(app.access) && normalizeOptionalString(app.access) !== "vpn") {
    throw new Error("Only VPN app access is supported.");
  }

  const envSchema = normalizeStringList(app.env_schema ?? app.envSchema);
  assertNoSecretValues(envSchema);
  return {
    name,
    slug,
    description: normalizeOptionalString(app.description) || "Private Link app.",
    ownerSquad: normalizeRequiredString(app.owner_squad ?? app.ownerSquad, "owner_squad"),
    audience: normalizeRequiredString(app.audience, "audience"),
    appType,
    riskLevel,
    sourceRepo,
    sourceRef: normalizeOptionalString(source.ref ?? source.source_ref) || "main",
    sourceSubdir: normalizeOptionalString(source.subdir ?? source.source_subdir) || ".",
    buildCommand: normalizeRequiredString(build.command ?? build.build_command, "build_command"),
    startCommand: normalizeOptionalString(build.start_command ?? build.startCommand) || undefined,
    outputDir: normalizeOptionalString(build.output_dir ?? build.outputDir) || undefined,
    envSchema,
    reviewers: normalizeStringList(app.reviewers),
  };
}

function normalizeAppType(value: unknown): LinkAppPublisherType {
  const normalized = normalizeOptionalString(value);
  if (normalized === "mcp_app") return "mcp_app";
  return "web";
}

function normalizeRiskLevel(value: unknown): RiskLevel {
  const normalized = normalizeOptionalString(value);
  if (["low", "medium", "high"].includes(normalized)) return normalized as RiskLevel;
  return "medium";
}

function normalizeReviewDecision(value: unknown): LinkAppPublisherDecision {
  const normalized = normalizeOptionalString(value);
  if (normalized === "approve" || normalized === "reject") return normalized;
  throw new Error("Review decision must be approve or reject.");
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(normalizeOptionalString).filter(Boolean);
  return normalizeOptionalString(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRequiredString(value: unknown, label: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "link-app"
  );
}

function assertSafeSourceRepo(value: string): void {
  const isSafe =
    /^https:\/\/github\.com\/team-telnyx\/[A-Za-z0-9_.-]+(?:\.git)?(?:\/)?$/i.test(value) ||
    /^git@github\.com:team-telnyx\/[A-Za-z0-9_.-]+(?:\.git)?$/i.test(value);
  if (!isSafe) throw new Error("source_repo must be a team-telnyx GitHub URL.");
}

function assertNoSecretValues(envSchema: string[]): void {
  const secretValue = envSchema.find((entry) => entry.includes("=") || /secret|token|key/i.test(entry) && entry.includes(":"));
  if (secretValue) throw new Error(`env_schema must declare variable names only, not secret values: ${secretValue}`);
}
