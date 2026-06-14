import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { AuditLogger, RiskLevel } from "./types.js";

export type LinkAppPublisherStatus = "submitted" | "building" | "preview" | "approved" | "rejected" | "failed" | "deprecated";
export type LinkAppPublisherType = "web" | "mcp_app";
export type LinkAppPublisherDecision = "approve" | "reject";
export type LinkAppDeploymentTarget = "preview" | "production";
export type LinkAppDeploymentStatus = "queued" | "running" | "succeeded" | "failed";

export interface LinkAppDeployment {
  id: string;
  appId: string;
  versionId: string;
  target: LinkAppDeploymentTarget;
  status: LinkAppDeploymentStatus;
  sourceRepo: string;
  sourceRef: string;
  sourceSubdir: string;
  url?: string;
  logUrl?: string;
  message: string;
  logs?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkAppDeploymentRequest {
  id: string;
  appId: string;
  version: LinkAppPublisherVersion;
  target: LinkAppDeploymentTarget;
  url?: string;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDir?: string;
  logUrl?: string;
  createdAt: string;
}

export interface LinkAppPublisherReadinessCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface LinkAppPublisherReadiness {
  ready: boolean;
  service: "link-app-publisher";
  storage: {
    configured: boolean;
    path?: string;
  };
  reviewerPolicy: {
    enforced: boolean;
  };
  deployer: {
    mode: string;
  };
  checks: LinkAppPublisherReadinessCheck[];
}

export interface LinkAppPublisherDeployer {
  readonly mode?: string;
  createDeployment(request: LinkAppDeploymentRequest): LinkAppDeployment;
  checkReadiness?(): LinkAppPublisherReadinessCheck[];
}

export interface LinkAppPublisherCommandRunner {
  run(command: string, args: string[], options: { cwd?: string; env?: Record<string, string | undefined>; timeoutMs?: number }): string;
}

export interface TelnyxEdgeCliDeployerOptions {
  edgeBinary?: string;
  gitBinary?: string;
  workspaceRoot?: string;
  timeoutMs?: number;
  keepWorkspace?: boolean;
  commandRunner?: LinkAppPublisherCommandRunner;
  env?: Record<string, string | undefined>;
}

const APPROVED_EDGE_HOST_SUFFIXES = [
  "apps.telnyx.io",
  "edge.telnyx.io",
  "internal.telnyx.com",
  "link-apps-preview.query.prod.telnyx.io",
  "query.prod.telnyx.io",
];
const appPublisherMetricsStartedAt = Date.now();
let appPublisherHttpRequestsTotal = 0;

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
  deploymentId?: string;
  deploymentStatus?: LinkAppDeploymentStatus;
  previewUrl?: string;
  deployedUrl?: string;
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
  installCommand?: string;
  buildCommand: string;
  startCommand?: string;
  outputDir?: string;
  envSchema: string[];
  reviewers: string[];
  previewUrl?: string;
  deployedUrl?: string;
  vpnUrl?: string;
  latestVersion: LinkAppPublisherVersion;
  versions: LinkAppPublisherVersion[];
  deployments: LinkAppDeployment[];
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
    install_command?: unknown;
    installCommand?: unknown;
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
  reviewer_groups?: unknown;
  reviewerGroups?: unknown;
}

export interface LinkAppRollbackInput {
  version_id?: unknown;
  versionId?: unknown;
  notes?: unknown;
  reviewer?: unknown;
  reviewer_groups?: unknown;
  reviewerGroups?: unknown;
}

export interface LinkAppOwnershipInput {
  owner_squad?: unknown;
  ownerSquad?: unknown;
  reviewers?: unknown;
  notes?: unknown;
  reviewer?: unknown;
  reviewer_groups?: unknown;
  reviewerGroups?: unknown;
}

export interface LinkAppDeprecationInput {
  notes?: unknown;
  reviewer?: unknown;
  reviewer_groups?: unknown;
  reviewerGroups?: unknown;
}

export interface LinkAppPublisherMutationResult {
  mode: "managed";
  message: string;
  intent_id?: string;
  app: LinkAppPublisherApp;
  version?: LinkAppPublisherVersion;
  deployment?: LinkAppDeployment;
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
  commands: string[];
  path: string;
  message: string;
}

export interface LinkAppPublisherServiceOptions {
  auditLogger?: AuditLogger;
  idGenerator?: () => string;
  now?: () => Date;
  previewBaseDomain?: string;
  vpnBaseDomain?: string;
  buildLogBaseUrl?: string;
  storagePath?: string;
  deployer?: LinkAppPublisherDeployer;
  enforceReviewers?: boolean;
}

export interface LinkAppPublisherHttpOptions {
  requireAuth?: boolean;
  requireAuthContext?: boolean;
}

class LinkAppPublisherPolicyError extends Error {
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = "LinkAppPublisherPolicyError";
  }
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
  installCommand?: string;
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
  private readonly storagePath?: string;
  private readonly deployer: LinkAppPublisherDeployer;
  private readonly enforceReviewers: boolean;

  constructor(options: LinkAppPublisherServiceOptions = {}) {
    this.auditLogger = options.auditLogger;
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.previewBaseDomain = options.previewBaseDomain ?? "link-apps-preview.query.prod.telnyx.io";
    this.vpnBaseDomain = options.vpnBaseDomain ?? "apps.telnyx.io";
    this.buildLogBaseUrl = normalizeOptionalHttpsUrl(options.buildLogBaseUrl, "buildLogBaseUrl");
    this.storagePath = options.storagePath;
    this.deployer = options.deployer ?? new RecordOnlyLinkAppDeployer();
    this.enforceReviewers = Boolean(options.enforceReviewers);
    for (const app of this.loadStoredApps()) {
      this.apps.set(app.id, app);
    }
  }

  listApps(): LinkAppPublisherApp[] {
    return [...this.apps.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getApp(idOrSlug: string): LinkAppPublisherApp | undefined {
    return this.listApps().find((app) => app.id === idOrSlug || app.slug === idOrSlug);
  }

  listDeployments(appId: string): LinkAppDeployment[] {
    return [...this.requireApp(appId).deployments].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getDeploymentLogs(appId: string, deploymentId: string): { deployment: LinkAppDeployment; logs: string } {
    const app = this.requireApp(appId);
    const deployment = app.deployments.find((item) => item.id === deploymentId);
    if (!deployment) throw new Error("Deployment not found.");
    return {
      deployment,
      logs: deployment.logs || deployment.message,
    };
  }

  listVersions(appId: string): LinkAppPublisherVersion[] {
    const app = this.requireApp(appId);
    return [...app.versions].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  }

  readiness(): LinkAppPublisherReadiness {
    const checks: LinkAppPublisherReadinessCheck[] = [
      {
        name: "Catalog storage configured",
        ok: Boolean(this.storagePath),
        detail: this.storagePath ? "persistent storage path configured" : "LINK_APP_PUBLISHER_STORAGE or --storage is required for production",
      },
      {
        name: "Reviewer policy enforced",
        ok: this.enforceReviewers,
        detail: this.enforceReviewers ? "reviewer policy is enforced" : "set LINK_APP_PUBLISHER_ENFORCE_REVIEWERS=1 or --enforce-reviewers",
      },
      ...(this.deployer.checkReadiness?.() ?? [
        {
          name: "Deployment adapter readiness",
          ok: false,
          detail: "deployment adapter does not expose readiness checks",
        },
      ]),
    ];
    return {
      ready: checks.every((check) => check.ok),
      service: "link-app-publisher",
      storage: {
        configured: Boolean(this.storagePath),
        path: this.storagePath,
      },
      reviewerPolicy: {
        enforced: this.enforceReviewers,
      },
      deployer: {
        mode: this.deployer.mode ?? (this.deployer.constructor.name || "custom"),
      },
      checks,
    };
  }

  createPublishIntent(input: LinkAppPublishIntentInput): LinkAppPublisherMutationResult {
    const intent = normalizePublishIntent(input);
    if (this.getApp(intent.slug)) {
      throw new Error(`App slug already exists: ${intent.slug}`);
    }

    const now = this.timestamp();
    const appId = `app-${intent.slug}`;
    const previewUrl = `https://${intent.slug}.${this.previewBaseDomain}`;
    const version = this.createVersionRecord(appId, intent.sourceRepo, intent.sourceRef, intent.sourceSubdir, "building");
    const deployment = this.createDeploymentRecord(appId, version, "preview", previewUrl, intent);
    const appStatus = publisherStatusForDeployment("preview", deployment);
    const activePreviewUrl = successfulDeploymentUrl(deployment);
    const versionWithDeployment = { ...withDeployment(version, deployment), status: appStatus };
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
      status: appStatus,
      sourceRepo: intent.sourceRepo,
      sourceRef: intent.sourceRef,
      sourceSubdir: intent.sourceSubdir,
      installCommand: intent.installCommand,
      buildCommand: intent.buildCommand,
      startCommand: intent.startCommand,
      outputDir: intent.outputDir,
      envSchema: intent.envSchema,
      reviewers: intent.reviewers,
      previewUrl: activePreviewUrl,
      latestVersion: versionWithDeployment,
      versions: [versionWithDeployment],
      deployments: [deployment],
      createdAt: now,
      updatedAt: now,
    };

    this.apps.set(app.id, app);
    this.persistApps();
    this.audit("link_app.publish_intent.created", "create_publish_intent", app.id, { slug: app.slug, status: app.status });
    return {
      mode: "managed",
      message: "Publish intent accepted. Preview is available for reviewer approval.",
      intent_id: `intent-${this.idGenerator()}`,
      app,
      version: versionWithDeployment,
      deployment,
      review: { status: app.status, reviewers: app.reviewers },
    };
  }

  createVersion(appId: string, input: LinkAppVersionInput): LinkAppPublisherMutationResult {
    const app = this.requireApp(appId);
    const sourceRepo = normalizeRequiredString(input.source_repo ?? input.sourceRepo, "source_repo");
    assertSafeSourceRepo(sourceRepo);
    const sourceRef = normalizeOptionalString(input.source_ref ?? input.sourceRef) || "main";
    const sourceSubdir = normalizeOptionalString(input.source_subdir ?? input.sourceSubdir) || ".";
    const version = this.createVersionRecord(app.id, sourceRepo, sourceRef, sourceSubdir, "building");
    const previewUrl = `https://${app.slug}.${this.previewBaseDomain}`;
    const deployment = this.createDeploymentRecord(app.id, version, "preview", previewUrl, app);
    const appStatus = publisherStatusForDeployment("preview", deployment);
    const activePreviewUrl = successfulDeploymentUrl(deployment);
    const versionWithDeployment = { ...withDeployment(version, deployment), status: appStatus };
    const next: LinkAppPublisherApp = {
      ...app,
      status: appStatus,
      sourceRepo,
      sourceRef,
      sourceSubdir,
      latestVersion: versionWithDeployment,
      previewUrl: activePreviewUrl,
      versions: [versionWithDeployment, ...app.versions.filter((item) => item.id !== versionWithDeployment.id)],
      deployments: [deployment, ...app.deployments],
      updatedAt: this.timestamp(),
    };
    this.apps.set(next.id, next);
    this.persistApps();
    this.audit("link_app.version.created", "create_app_version", next.id, { sourceRef, sourceSubdir });
    return {
      mode: "managed",
      message: "Version request accepted. Preview is available for reviewer approval.",
      app: next,
      version: versionWithDeployment,
      deployment,
      review: { status: next.status, reviewers: next.reviewers },
    };
  }

  reviewApp(appId: string, input: LinkAppReviewInput): LinkAppPublisherMutationResult {
    const app = this.requireApp(appId);
    const decision = normalizeReviewDecision(input.decision);
    this.assertReviewerAllowed(app, input);
    const now = this.timestamp();
    const reviewNotes = normalizeOptionalString(input.notes);
    const requestedDeployedUrl = decision === "approve" ? `https://${app.slug}.${this.vpnBaseDomain}` : app.deployedUrl;
    const deployment = decision === "approve" ? this.createDeploymentRecord(app.id, app.latestVersion, "production", requestedDeployedUrl, app) : undefined;
    const status: LinkAppPublisherStatus = decision === "approve" && deployment ? publisherStatusForDeployment("production", deployment) : "rejected";
    const deployedUrl = decision === "approve" ? successfulDeploymentUrl(deployment) ?? app.deployedUrl : app.deployedUrl;
    const nextVersion: LinkAppPublisherVersion = {
      ...app.latestVersion,
      status,
      reviewedAt: now,
      ...(deployment ? deploymentVersionFields(deployment) : {}),
    };
    const next: LinkAppPublisherApp = {
      ...app,
      status,
      latestVersion: nextVersion,
      versions: [nextVersion, ...app.versions.filter((item) => item.id !== nextVersion.id)],
      deployedUrl,
      vpnUrl: deployedUrl,
      deployments: deployment ? [deployment, ...app.deployments] : app.deployments,
      reviewNotes,
      updatedAt: now,
    };
    this.apps.set(next.id, next);
    this.persistApps();
    this.audit("link_app.reviewed", "review_app", next.id, {
      decision,
      reviewer: normalizeOptionalString(input.reviewer),
      reviewerGroups: normalizeStringList(input.reviewer_groups ?? input.reviewerGroups),
      status,
    });
    return {
      mode: "managed",
      message: `App ${status}.`,
      app: next,
      version: nextVersion,
      deployment,
      review: { status, reviewers: next.reviewers, notes: reviewNotes || undefined },
    };
  }

  rollbackApp(appId: string, input: LinkAppRollbackInput = {}): LinkAppPublisherMutationResult {
    const app = this.requireApp(appId);
    this.assertReviewerAllowed(app, input);
    const targetVersionId = normalizeOptionalString(input.version_id ?? input.versionId);
    const targetVersion = targetVersionId
      ? app.versions.find((version) => version.id === targetVersionId)
      : app.versions.find((version) => version.id !== app.latestVersion.id && version.deploymentStatus === "succeeded") ?? app.versions[1];
    if (!targetVersion) throw new Error("Rollback target version was not found.");

    const now = this.timestamp();
    const deployedUrl = `https://${app.slug}.${this.vpnBaseDomain}`;
    const deployment = this.createDeploymentRecord(app.id, targetVersion, "production", deployedUrl, app);
    const status = publisherStatusForDeployment("production", deployment);
    const activeDeployedUrl = successfulDeploymentUrl(deployment) ?? app.deployedUrl;
    const nextVersion: LinkAppPublisherVersion = {
      ...targetVersion,
      status,
      reviewedAt: now,
      ...deploymentVersionFields(deployment),
    };
    const next: LinkAppPublisherApp = {
      ...app,
      status,
      sourceRepo: nextVersion.sourceRepo,
      sourceRef: nextVersion.sourceRef,
      sourceSubdir: nextVersion.sourceSubdir,
      latestVersion: nextVersion,
      versions: [nextVersion, ...app.versions.filter((version) => version.id !== nextVersion.id)],
      deployedUrl: activeDeployedUrl,
      vpnUrl: activeDeployedUrl,
      deployments: [deployment, ...app.deployments],
      reviewNotes: normalizeOptionalString(input.notes) || app.reviewNotes,
      updatedAt: now,
    };
    this.apps.set(next.id, next);
    this.persistApps();
    this.audit("link_app.rolled_back", "rollback_app", next.id, { versionId: nextVersion.id, status });
    return {
      mode: "managed",
      message: `App rolled back to ${nextVersion.sourceRef}.`,
      app: next,
      version: nextVersion,
      deployment,
      review: { status, reviewers: next.reviewers, notes: normalizeOptionalString(input.notes) || undefined },
    };
  }

  transferOwnership(appId: string, input: LinkAppOwnershipInput): LinkAppPublisherMutationResult {
    const app = this.requireApp(appId);
    this.assertReviewerAllowed(app, input);
    const ownerSquad = normalizeRequiredString(input.owner_squad ?? input.ownerSquad, "owner_squad");
    const suppliedReviewers = "reviewers" in input ? normalizeStringList(input.reviewers) : app.reviewers;
    const reviewerSet = new Set([...suppliedReviewers, ownerSquad].map(normalizeOptionalString).filter(Boolean));
    const now = this.timestamp();
    const next: LinkAppPublisherApp = {
      ...app,
      ownerSquad,
      reviewers: [...reviewerSet],
      reviewNotes: normalizeOptionalString(input.notes) || app.reviewNotes,
      updatedAt: now,
    };
    this.apps.set(next.id, next);
    this.persistApps();
    this.audit("link_app.ownership_transferred", "transfer_ownership", next.id, { ownerSquad });
    return {
      mode: "managed",
      message: `App ownership transferred to ${ownerSquad}.`,
      app: next,
      version: next.latestVersion,
      review: { status: next.status, reviewers: next.reviewers, notes: normalizeOptionalString(input.notes) || undefined },
    };
  }

  deprecateApp(appId: string, input: LinkAppDeprecationInput = {}): LinkAppPublisherMutationResult {
    const app = this.requireApp(appId);
    this.assertReviewerAllowed(app, input);
    const now = this.timestamp();
    const nextVersion: LinkAppPublisherVersion = {
      ...app.latestVersion,
      status: "deprecated",
      reviewedAt: now,
    };
    const next: LinkAppPublisherApp = {
      ...app,
      status: "deprecated",
      latestVersion: nextVersion,
      versions: [nextVersion, ...app.versions.filter((version) => version.id !== nextVersion.id)],
      reviewNotes: normalizeOptionalString(input.notes) || app.reviewNotes,
      updatedAt: now,
    };
    this.apps.set(next.id, next);
    this.persistApps();
    this.audit("link_app.deprecated", "deprecate_app", next.id, { notes: normalizeOptionalString(input.notes) });
    return {
      mode: "managed",
      message: "App deprecated.",
      app: next,
      version: nextVersion,
      review: { status: "deprecated", reviewers: next.reviewers, notes: normalizeOptionalString(input.notes) || undefined },
    };
  }

  private assertReviewerAllowed(app: LinkAppPublisherApp, input: LinkAppReviewInput): void {
    if (!this.enforceReviewers) return;
    const reviewer = normalizeOptionalString(input.reviewer);
    const reviewerGroups = normalizeStringList(input.reviewer_groups ?? input.reviewerGroups);
    const allowedReviewers = new Set([...app.reviewers, app.ownerSquad].map(normalizePolicyPrincipal).filter(Boolean));
    const presentedPrincipals = [reviewer, ...reviewerGroups].map(normalizePolicyPrincipal).filter(Boolean);
    if (presentedPrincipals.some((principal) => allowedReviewers.has(principal))) return;
    throw new LinkAppPublisherPolicyError("Reviewer is not allowed to approve or reject this app.");
  }

  duplicateApp(appId: string): LinkAppDuplicateResult {
    const app = this.requireApp(appId);
    const commands = duplicateCommands(app);
    this.audit("link_app.duplicated", "duplicate_app", app.id, { sourceRef: app.sourceRef });
    return {
      mode: "managed",
      action: "source_ref",
      source_repo: app.sourceRepo,
      source_ref: app.sourceRef,
      source_subdir: app.sourceSubdir,
      command: commands.join(" && "),
      commands,
      path: duplicatePath(app),
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
      buildLogUrl: this.buildLogUrl(versionId),
    };
  }

  private createDeploymentRecord(
    appId: string,
    version: LinkAppPublisherVersion,
    target: LinkAppDeploymentTarget,
    url?: string,
    buildConfig: { installCommand?: string; buildCommand?: string; startCommand?: string; outputDir?: string } = {},
  ): LinkAppDeployment {
    const now = this.timestamp();
    const deploymentId = `deployment-${this.idGenerator()}`;
    return this.deployer.createDeployment({
      id: deploymentId,
      appId,
      version,
      target,
      url,
      installCommand: buildConfig.installCommand,
      buildCommand: buildConfig.buildCommand,
      startCommand: buildConfig.startCommand,
      outputDir: buildConfig.outputDir,
      logUrl: this.buildLogUrl(version.id),
      createdAt: now,
    });
  }

  private buildLogUrl(versionId: string): string | undefined {
    if (!this.buildLogBaseUrl) return undefined;
    return `${this.buildLogBaseUrl}/${encodeURIComponent(versionId)}`;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private audit(eventType: string, action: string, target: string, metadata: Record<string, unknown>): void {
    this.auditLogger?.record({ actorId: "link-app-publisher", surface: "publisher-api", eventType, action, target, metadata });
  }

  private loadStoredApps(): LinkAppPublisherApp[] {
    if (!this.storagePath || !existsSync(this.storagePath)) return [];
    const payload = JSON.parse(readFileSync(this.storagePath, "utf8")) as unknown;
    return readStoredApps(payload);
  }

  private persistApps(): void {
    if (!this.storagePath) return;
    mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const temporaryPath = `${this.storagePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ apps: this.listApps() }, null, 2));
    renameSync(temporaryPath, this.storagePath);
  }
}

export class RecordOnlyLinkAppDeployer implements LinkAppPublisherDeployer {
  readonly mode = "record-only";

  checkReadiness(): LinkAppPublisherReadinessCheck[] {
    return [
      {
        name: "Production Edge deployer",
        ok: false,
        detail: "record-only deployer is for local development and does not run telnyx-edge ship",
      },
    ];
  }

  createDeployment(request: LinkAppDeploymentRequest): LinkAppDeployment {
    return {
      id: request.id,
      appId: request.appId,
      versionId: request.version.id,
      target: request.target,
      status: "succeeded",
      sourceRepo: request.version.sourceRepo,
      sourceRef: request.version.sourceRef,
      sourceSubdir: request.version.sourceSubdir,
      url: request.url,
      logUrl: request.logUrl,
      message: "Deployment recorded by the Link App Publisher; production Edge deployers can replace this record-only adapter.",
      logs: "Deployment recorded by the Link App Publisher; no Edge job ran in record-only mode.",
      createdAt: request.createdAt,
      updatedAt: request.createdAt,
    };
  }
}

export class TelnyxEdgeCliDeployer implements LinkAppPublisherDeployer {
  readonly mode = "telnyx-edge";
  private readonly edgeBinary: string;
  private readonly gitBinary: string;
  private readonly workspaceRoot: string;
  private readonly timeoutMs: number;
  private readonly keepWorkspace: boolean;
  private readonly commandRunner: LinkAppPublisherCommandRunner;
  private readonly env: Record<string, string | undefined>;

  constructor(options: TelnyxEdgeCliDeployerOptions = {}) {
    this.edgeBinary = options.edgeBinary ?? process.env.TELNYX_EDGE_PATH ?? "telnyx-edge";
    this.gitBinary = options.gitBinary ?? "git";
    this.workspaceRoot = options.workspaceRoot ?? os.tmpdir();
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.keepWorkspace = Boolean(options.keepWorkspace);
    this.commandRunner = options.commandRunner ?? new ExecFileCommandRunner();
    this.env = options.env ?? process.env;
  }

  checkReadiness(): LinkAppPublisherReadinessCheck[] {
    const checks: LinkAppPublisherReadinessCheck[] = [];
    try {
      mkdirSync(this.workspaceRoot, { recursive: true });
      checks.push({
        name: "Deployment workspace",
        ok: true,
        detail: this.workspaceRoot,
      });
    } catch (error) {
      checks.push({
        name: "Deployment workspace",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    checks.push(commandReadinessCheck(this.commandRunner, this.gitBinary, ["--version"], "Git CLI", this.env, this.timeoutMs));
    checks.push(commandReadinessCheck(this.commandRunner, this.edgeBinary, ["--help"], "telnyx-edge CLI", this.env, this.timeoutMs));

    try {
      const authOutput = this.commandRunner.run(this.edgeBinary, ["auth", "status"], {
        env: this.env,
        timeoutMs: this.timeoutMs,
      });
      const authenticated = isEdgeAuthenticated(authOutput);
      checks.push({
        name: "telnyx-edge authenticated",
        ok: authenticated,
        detail: authenticated ? edgeAuthMode(authOutput) : "not authenticated",
      });
    } catch (error) {
      checks.push({
        name: "telnyx-edge authenticated",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    return checks;
  }

  createDeployment(request: LinkAppDeploymentRequest): LinkAppDeployment {
    const workspace = mkdtempSync(path.join(this.workspaceRoot, "link-app-publisher-"));
    const sourceDir = path.join(workspace, "source");
    const sourceSubdir = safeSourceSubdir(request.version.sourceSubdir);
    const edgeCwd = path.resolve(sourceDir, sourceSubdir);
    const deploymentEnv = {
      ...this.env,
      LINK_APP_ID: request.appId,
      LINK_APP_VERSION_ID: request.version.id,
      LINK_APP_DEPLOYMENT_ID: request.id,
      LINK_APP_DEPLOYMENT_TARGET: request.target,
      LINK_APP_INSTALL_COMMAND: request.installCommand,
      LINK_APP_BUILD_COMMAND: request.buildCommand,
      LINK_APP_OUTPUT_DIR: request.outputDir,
    };

    try {
      this.commandRunner.run(this.gitBinary, ["clone", request.version.sourceRepo, sourceDir], {
        env: deploymentEnv,
        timeoutMs: this.timeoutMs,
      });
      this.commandRunner.run(this.gitBinary, ["-C", sourceDir, "checkout", request.version.sourceRef], {
        env: deploymentEnv,
        timeoutMs: this.timeoutMs,
      });
      if (!existsSync(edgeCwd)) throw new Error(`Source subdir does not exist after checkout: ${sourceSubdir}`);
      const installOutput = runAllowedInstallCommand(this.commandRunner, request.installCommand, edgeCwd, deploymentEnv, this.timeoutMs);
      const buildOutput = runAllowedBuildCommand(this.commandRunner, request.buildCommand, edgeCwd, deploymentEnv, this.timeoutMs);
      if (request.outputDir) {
        const outputPath = path.resolve(edgeCwd, safeSourceSubdir(request.outputDir));
        if (!existsSync(outputPath)) throw new Error(`output_dir does not exist after build: ${request.outputDir}`);
      }
      const shipOutput = this.commandRunner.run(this.edgeBinary, ["ship"], {
        cwd: edgeCwd,
        env: deploymentEnv,
        timeoutMs: this.timeoutMs,
      });
      const combinedOutput = [installOutput, buildOutput, shipOutput].filter(Boolean).join("\n");
      const deployedUrl = safeDeploymentUrl(extractFirstHttpsUrl(shipOutput) || request.url);
      return {
        id: request.id,
        appId: request.appId,
        versionId: request.version.id,
        target: request.target,
        status: "succeeded",
        sourceRepo: request.version.sourceRepo,
        sourceRef: request.version.sourceRef,
        sourceSubdir: request.version.sourceSubdir,
        url: deployedUrl,
        logUrl: request.logUrl,
        message: trimDeploymentMessage(combinedOutput) || "telnyx-edge ship completed.",
        logs: trimDeploymentLogs(combinedOutput),
        createdAt: request.createdAt,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const failureLogs = trimDeploymentLogs(errorOutput(error) || (error instanceof Error ? error.message : String(error)));
      return {
        id: request.id,
        appId: request.appId,
        versionId: request.version.id,
        target: request.target,
        status: "failed",
        sourceRepo: request.version.sourceRepo,
        sourceRef: request.version.sourceRef,
        sourceSubdir: request.version.sourceSubdir,
        url: request.url,
        logUrl: request.logUrl,
        message: error instanceof Error ? error.message : String(error),
        logs: failureLogs,
        createdAt: request.createdAt,
        updatedAt: new Date().toISOString(),
      };
    } finally {
      if (!this.keepWorkspace) {
        rmSync(workspace, { recursive: true, force: true });
      }
    }
  }
}

class ExecFileCommandRunner implements LinkAppPublisherCommandRunner {
  run(command: string, args: string[], options: { cwd?: string; env?: Record<string, string | undefined>; timeoutMs?: number }): string {
    return execFileSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs,
    });
  }
}

function commandReadinessCheck(
  commandRunner: LinkAppPublisherCommandRunner,
  command: string,
  args: string[],
  name: string,
  env: Record<string, string | undefined>,
  timeoutMs: number,
): LinkAppPublisherReadinessCheck {
  try {
    const output = commandRunner.run(command, args, { env, timeoutMs });
    return { name, ok: true, detail: trimDeploymentMessage(output) || "available" };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function runAllowedInstallCommand(
  commandRunner: LinkAppPublisherCommandRunner,
  installCommand: string | undefined,
  cwd: string,
  env: Record<string, string | undefined>,
  timeoutMs: number,
): string {
  const normalized = normalizeOptionalString(installCommand) || inferInstallCommand(cwd);
  if (!normalized) return "";
  const [command, ...args] = parseAllowedInstallCommand(normalized);
  return commandRunner.run(command, args, { cwd, env, timeoutMs });
}

function runAllowedBuildCommand(
  commandRunner: LinkAppPublisherCommandRunner,
  buildCommand: string | undefined,
  cwd: string,
  env: Record<string, string | undefined>,
  timeoutMs: number,
): string {
  const normalized = normalizeOptionalString(buildCommand);
  if (!normalized) return "";
  const [command, ...args] = parseAllowedBuildCommand(normalized);
  return commandRunner.run(command, args, { cwd, env, timeoutMs });
}

function inferInstallCommand(cwd: string): string {
  if (existsSync(path.join(cwd, "package-lock.json")) || existsSync(path.join(cwd, "npm-shrinkwrap.json"))) return "npm ci";
  if (existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm install --frozen-lockfile";
  if (existsSync(path.join(cwd, "yarn.lock"))) return "yarn install --frozen-lockfile";
  if (existsSync(path.join(cwd, "bun.lockb")) || existsSync(path.join(cwd, "bun.lock"))) return "bun install";
  if (existsSync(path.join(cwd, "package.json"))) return "npm install";
  return "";
}

function parseAllowedInstallCommand(value: string): string[] {
  if (/[;&|<>`$\\]/.test(value)) {
    throw new Error("install_command must be a single package-manager command without shell operators.");
  }
  const parts = value.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  const [command = "", ...args] = parts;
  if (!["npm", "pnpm", "yarn", "bun"].includes(command)) {
    throw new Error("install_command must use npm, pnpm, yarn, or bun.");
  }
  if (args.some((arg) => arg.startsWith("-") && !/^--[A-Za-z0-9][A-Za-z0-9_.=-]*$/.test(arg))) {
    throw new Error("install_command contains an unsupported option.");
  }
  if (command === "npm") {
    if (!["ci", "install"].includes(args[0] ?? "")) throw new Error("npm install_command must be `npm ci` or `npm install`.");
  } else if (command === "pnpm") {
    if (args[0] !== "install") throw new Error("pnpm install_command must be `pnpm install`.");
  } else if (command === "yarn") {
    if (args[0] !== "install") throw new Error("yarn install_command must be `yarn install`.");
  } else if (command === "bun") {
    if (args[0] !== "install") throw new Error("bun install_command must be `bun install`.");
  }
  return parts;
}

function parseAllowedBuildCommand(value: string): string[] {
  if (/[;&|<>`$\\]/.test(value)) {
    throw new Error("build_command must be a single package-manager command without shell operators.");
  }
  const parts = value.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  const [command = "", ...args] = parts;
  if (!["npm", "pnpm", "yarn", "bun"].includes(command)) {
    throw new Error("build_command must use npm, pnpm, yarn, or bun.");
  }
  if (args.some((arg) => arg.startsWith("-") && arg !== "--" && !/^--[A-Za-z0-9][A-Za-z0-9_.=-]*$/.test(arg))) {
    throw new Error("build_command contains an unsupported option.");
  }
  if (command === "npm") {
    const allowed = args[0] === "run" && Boolean(args[1]) || ["ci", "install"].includes(args[0] ?? "");
    if (!allowed) throw new Error("npm build_command must be `npm run <script>`, `npm ci`, or `npm install`.");
  } else if (command === "pnpm") {
    const allowed = args[0] === "run" && Boolean(args[1]) || ["install"].includes(args[0] ?? "");
    if (!allowed) throw new Error("pnpm build_command must be `pnpm run <script>` or `pnpm install`.");
  } else if (command === "yarn") {
    const allowed = Boolean(args[0]) && args[0] !== "exec" && args[0] !== "node";
    if (!allowed) throw new Error("yarn build_command must run a package script or install command.");
  } else if (command === "bun") {
    const allowed = args[0] === "run" && Boolean(args[1]) || args[0] === "install";
    if (!allowed) throw new Error("bun build_command must be `bun run <script>` or `bun install`.");
  }
  return parts;
}

function isEdgeAuthenticated(output: string): boolean {
  const text = output.toLowerCase();
  return !(
    text.includes("authentication status: none") ||
    text.includes("not authenticated") ||
    text.includes("status: x") ||
    text.includes("status: ❌")
  );
}

function edgeAuthMode(output: string): string {
  const text = output.toLowerCase();
  if (text.includes("api key")) return "api_key";
  if (text.includes("oauth") || text.includes("logged in") || text.includes("browser")) return "oauth";
  return "authenticated";
}

export function createLinkAppPublisherHttpHandler(
  service = new LinkAppPublisherService(),
  options: LinkAppPublisherHttpOptions = {},
): (request: IncomingMessage, response: ServerResponse) => void {
  const requireAuth = options.requireAuth ?? true;
  const requireAuthContext = Boolean(options.requireAuthContext);
  return (request, response) => {
    void handlePublisherRequest(service, request, response, { requireAuth, requireAuthContext });
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
  options: Required<LinkAppPublisherHttpOptions>,
): Promise<void> {
  appPublisherHttpRequestsTotal += 1;
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      sendJson(response, 200, { ok: true, service: "link-app-publisher" });
      return;
    }
    if (request.method === "GET" && request.url === "/readyz") {
      const readiness = withHttpReadinessChecks(service.readiness(), options);
      sendJson(response, readiness.ready ? 200 : 503, readiness);
      return;
    }
    if (request.method === "GET" && request.url === "/metrics") {
      sendText(response, 200, "text/plain; version=0.0.4; charset=utf-8", appPublisherMetricsText());
      return;
    }
    if (options.requireAuth && !isAuthorizedPublisherRequest(request, options.requireAuthContext)) {
      sendJson(response, 401, {
        error: options.requireAuthContext
          ? "Link App Publisher requires auth plus Telnyx actor or group context."
          : "Link App Publisher requires Okta Rev2 auth or TELNYX_API_KEY.",
      });
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
    if (request.method === "GET" && parts.length === 3 && parts[0] === "apps" && parts[2] === "deployments") {
      sendJson(response, 200, { deployments: service.listDeployments(parts[1]) });
      return;
    }
    if (request.method === "GET" && parts.length === 5 && parts[0] === "apps" && parts[2] === "deployments" && parts[4] === "logs") {
      sendJson(response, 200, service.getDeploymentLogs(parts[1], parts[3]));
      return;
    }
    if (request.method === "GET" && parts.length === 3 && parts[0] === "apps" && parts[2] === "versions") {
      sendJson(response, 200, { versions: service.listVersions(parts[1]) });
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
      sendJson(response, 200, service.reviewApp(parts[1], withReviewerContext((await readJson(request)) as LinkAppReviewInput, request)));
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "apps" && parts[2] === "rollback") {
      sendJson(response, 200, service.rollbackApp(parts[1], withReviewerContext((await readJson(request)) as LinkAppRollbackInput, request)));
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "apps" && parts[2] === "ownership") {
      sendJson(response, 200, service.transferOwnership(parts[1], withReviewerContext((await readJson(request)) as LinkAppOwnershipInput, request)));
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "apps" && parts[2] === "deprecations") {
      sendJson(response, 200, service.deprecateApp(parts[1], withReviewerContext((await readJson(request)) as LinkAppDeprecationInput, request)));
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[0] === "apps" && parts[2] === "duplicate") {
      sendJson(response, 200, service.duplicateApp(parts[1]));
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 400;
    sendJson(response, Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 ? statusCode : 400, {
      error: error instanceof Error ? error.message : String(error),
    });
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

function sendText(response: ServerResponse, statusCode: number, contentType: string, body: string): void {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(body);
}

function appPublisherMetricsText(): string {
  const uptimeSeconds = Math.max(0, (Date.now() - appPublisherMetricsStartedAt) / 1000);
  return [
    "# HELP link_app_publisher_up Link App Publisher process health.",
    "# TYPE link_app_publisher_up gauge",
    "link_app_publisher_up 1",
    "# HELP link_app_publisher_http_requests_total Total HTTP requests handled by Link App Publisher.",
    "# TYPE link_app_publisher_http_requests_total counter",
    `link_app_publisher_http_requests_total ${appPublisherHttpRequestsTotal}`,
    "# HELP link_app_publisher_process_uptime_seconds Link App Publisher process uptime in seconds.",
    "# TYPE link_app_publisher_process_uptime_seconds gauge",
    `link_app_publisher_process_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
    "",
  ].join("\n");
}

function withHttpReadinessChecks(
  readiness: LinkAppPublisherReadiness,
  options: Required<LinkAppPublisherHttpOptions>,
): LinkAppPublisherReadiness {
  const checks = [
    ...readiness.checks,
    {
      name: "Publisher auth required",
      ok: options.requireAuth,
      detail: options.requireAuth ? "auth is required for publisher API requests" : "production publisher must not run with --dev-no-auth",
    },
    {
      name: "Authenticated actor context enforced",
      ok: options.requireAuth && options.requireAuthContext,
      detail: options.requireAuthContext
        ? "actor or group context is required for publisher API requests"
        : "set LINK_APP_PUBLISHER_REQUIRE_AUTH_CONTEXT=1 or --require-auth-context",
    },
  ];
  return {
    ...readiness,
    ready: checks.every((check) => check.ok),
    checks,
  };
}

function isAuthorizedPublisherRequest(request: IncomingMessage, requireAuthContext = false): boolean {
  const authorization = request.headers.authorization ?? "";
  const authenticated = authorization.startsWith("Bearer ") || Boolean(request.headers["x-telnyx-auth-rev2"] || request.headers["x-telnyx-api-key"]);
  if (!authenticated) return false;
  if (!requireAuthContext) return true;
  return Boolean(
    headerString(request, "x-telnyx-actor") ||
    headerString(request, "x-actor") ||
    headerString(request, "x-telnyx-user") ||
    headerString(request, "x-telnyx-groups") ||
    headerString(request, "x-on-behalf-of"),
  );
}

function withReviewerContext(input: LinkAppReviewInput, request: IncomingMessage): LinkAppReviewInput {
  return {
    ...input,
    reviewer: input.reviewer ?? headerString(request, "x-telnyx-actor") ?? headerString(request, "x-actor") ?? headerString(request, "x-telnyx-user"),
    reviewer_groups:
      input.reviewer_groups ??
      input.reviewerGroups ??
      headerString(request, "x-telnyx-groups") ??
      headerString(request, "x-on-behalf-of"),
  };
}

function headerString(request: IncomingMessage, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(",") : value ?? "";
}

function withDeployment(version: LinkAppPublisherVersion, deployment: LinkAppDeployment): LinkAppPublisherVersion {
  return {
    ...version,
    ...deploymentVersionFields(deployment),
  };
}

function deploymentVersionFields(deployment: LinkAppDeployment): Partial<LinkAppPublisherVersion> {
  const url = successfulDeploymentUrl(deployment);
  return {
    deploymentId: deployment.id,
    deploymentStatus: deployment.status,
    ...(deployment.logUrl ? { buildLogUrl: deployment.logUrl } : {}),
    ...(deployment.target === "preview" ? { previewUrl: url } : {}),
    ...(deployment.target === "production" ? { deployedUrl: url } : {}),
  };
}

function successfulDeploymentUrl(deployment: LinkAppDeployment | undefined): string | undefined {
  return deployment?.status === "succeeded" ? deployment.url : undefined;
}

function duplicateCommands(app: LinkAppPublisherApp): string[] {
  const targetDirectory = app.slug || app.id;
  return [
    `git clone ${shellQuote(app.sourceRepo)} ${shellQuote(targetDirectory)}`,
    `cd ${shellQuote(targetDirectory)}`,
    `git checkout ${shellQuote(app.sourceRef)}`,
    ...(app.sourceSubdir && app.sourceSubdir !== "." ? [`cd ${shellQuote(app.sourceSubdir)}`] : []),
  ];
}

function duplicatePath(app: LinkAppPublisherApp): string {
  const targetDirectory = app.slug || app.id;
  return app.sourceSubdir && app.sourceSubdir !== "." ? `${targetDirectory}/${app.sourceSubdir}` : targetDirectory;
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function publisherStatusForDeployment(target: LinkAppDeploymentTarget, deployment: LinkAppDeployment): LinkAppPublisherStatus {
  if (deployment.status === "succeeded") return target === "production" ? "approved" : "preview";
  if (deployment.status === "failed") return "failed";
  return "building";
}

function safeSourceSubdir(value: string): string {
  const normalized = normalizeOptionalString(value) || ".";
  if (path.isAbsolute(normalized) || normalized.split(/[\\/]/).includes("..")) {
    throw new Error("source_subdir cannot be absolute or contain parent directory segments.");
  }
  return normalized;
}

function extractFirstHttpsUrl(value: string): string {
  return value.match(/https:\/\/[^\s"'<>]+/)?.[0] ?? "";
}

function safeDeploymentUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`telnyx-edge returned an invalid deployment URL: ${value}`);
  }
  const hostname = url.hostname.toLowerCase();
  const allowed =
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    APPROVED_EDGE_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
  if (!allowed) {
    throw new Error(`telnyx-edge returned a deployment URL outside approved internal/VPN hostnames: ${value}`);
  }
  return url.pathname === "/" && !url.search && !url.hash && !value.endsWith("/") ? `${url.protocol}//${url.host}` : url.toString();
}

function trimDeploymentMessage(value: string): string {
  return sanitizeDeploymentLog(value).trim().split("\n").map((line) => line.trim()).filter(Boolean).slice(-4).join("\n").slice(0, 2_000);
}

function trimDeploymentLogs(value: string): string {
  return sanitizeDeploymentLog(value).trim().split("\n").map((line) => line.trimEnd()).filter(Boolean).slice(-200).join("\n").slice(0, 20_000);
}

function sanitizeDeploymentLog(value: string): string {
  return value
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(x-telnyx-(?:api-key|auth-rev2):\s*)[^\s]+/gi, "$1[redacted]")
    .replace(/((?:TELNYX|GH|GITHUB|HINDSIGHT|LINEAR|SLACK|GOOGLE|OPENAI|LITELLM)_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|AUTH|PASSWORD)[A-Z0-9_]*=)[^\s]+/gi, "$1[redacted]")
    .replace(/(https:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, "$1$2:[redacted]@");
}

function errorOutput(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  const chunks = [record.stdout, record.stderr].map((value) => {
    if (typeof value === "string") return value;
    if (Buffer.isBuffer(value)) return value.toString("utf8");
    return "";
  });
  return chunks.filter(Boolean).join("\n");
}

function readStoredApps(payload: unknown): LinkAppPublisherApp[] {
  const items = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.apps)
      ? payload.apps
      : [];
  return items.map(readStoredApp).filter((app): app is LinkAppPublisherApp => Boolean(app));
}

function readStoredApp(value: unknown): LinkAppPublisherApp | null {
  if (!isRecord(value)) return null;
  const id = normalizeOptionalString(value.id);
  const name = normalizeOptionalString(value.name);
  const slug = normalizeOptionalString(value.slug);
  const latestVersion = readStoredVersion(value.latestVersion ?? value.latest_version, id);
  if (!id || !name || !slug || !latestVersion) return null;
  const versions = readStoredVersions(value.versions, id, latestVersion);
  return {
    id,
    name,
    slug,
    description: normalizeOptionalString(value.description) || "Private Link app.",
    ownerSquad: normalizeOptionalString(value.ownerSquad ?? value.owner_squad) || "unknown.squad",
    audience: normalizeOptionalString(value.audience) || "Telnyx",
    appType: normalizeAppType(value.appType ?? value.app_type),
    access: "vpn",
    riskLevel: normalizeRiskLevel(value.riskLevel ?? value.risk_level),
    status: normalizePublisherStatus(value.status),
    sourceRepo: normalizeOptionalString(value.sourceRepo ?? value.source_repo),
    sourceRef: normalizeOptionalString(value.sourceRef ?? value.source_ref) || "main",
    sourceSubdir: normalizeOptionalString(value.sourceSubdir ?? value.source_subdir) || ".",
    installCommand: normalizeOptionalString(value.installCommand ?? value.install_command) || undefined,
    buildCommand: normalizeOptionalString(value.buildCommand ?? value.build_command) || "npm run build",
    startCommand: normalizeOptionalString(value.startCommand ?? value.start_command) || undefined,
    outputDir: normalizeOptionalString(value.outputDir ?? value.output_dir) || undefined,
    envSchema: normalizeStringList(value.envSchema ?? value.env_schema),
    reviewers: normalizeStringList(value.reviewers),
    previewUrl: normalizeOptionalString(value.previewUrl ?? value.preview_url) || undefined,
    deployedUrl: normalizeOptionalString(value.deployedUrl ?? value.deployed_url) || undefined,
    vpnUrl: normalizeOptionalString(value.vpnUrl ?? value.vpn_url) || undefined,
    latestVersion,
    versions,
    deployments: readStoredDeployments(value.deployments),
    reviewNotes: normalizeOptionalString(value.reviewNotes ?? value.review_notes) || undefined,
    createdAt: normalizeOptionalString(value.createdAt ?? value.created_at) || new Date().toISOString(),
    updatedAt: normalizeOptionalString(value.updatedAt ?? value.updated_at) || new Date().toISOString(),
  };
}

function readStoredVersions(value: unknown, appId: string, latestVersion: LinkAppPublisherVersion): LinkAppPublisherVersion[] {
  const versions = Array.isArray(value)
    ? value.map((item) => readStoredVersion(item, appId)).filter((version): version is LinkAppPublisherVersion => Boolean(version))
    : [];
  const byId = new Map<string, LinkAppPublisherVersion>();
  for (const version of [latestVersion, ...versions]) {
    byId.set(version.id, version);
  }
  return [...byId.values()];
}

function readStoredVersion(value: unknown, appId: string): LinkAppPublisherVersion | null {
  if (!isRecord(value)) return null;
  const id = normalizeOptionalString(value.id);
  if (!id) return null;
  return {
    id,
    appId: normalizeOptionalString(value.appId ?? value.app_id) || appId,
    version: normalizeOptionalString(value.version) || "draft",
    sourceRepo: normalizeOptionalString(value.sourceRepo ?? value.source_repo),
    sourceRef: normalizeOptionalString(value.sourceRef ?? value.source_ref) || "main",
    sourceSubdir: normalizeOptionalString(value.sourceSubdir ?? value.source_subdir) || ".",
    status: normalizePublisherStatus(value.status),
    submittedAt: normalizeOptionalString(value.submittedAt ?? value.submitted_at) || new Date().toISOString(),
    reviewedAt: normalizeOptionalString(value.reviewedAt ?? value.reviewed_at) || undefined,
    buildLogUrl: normalizeOptionalString(value.buildLogUrl ?? value.build_log_url) || undefined,
    deploymentId: normalizeOptionalString(value.deploymentId ?? value.deployment_id) || undefined,
    deploymentStatus: normalizeDeploymentStatus(value.deploymentStatus ?? value.deployment_status),
    previewUrl: normalizeOptionalString(value.previewUrl ?? value.preview_url) || undefined,
    deployedUrl: normalizeOptionalString(value.deployedUrl ?? value.deployed_url) || undefined,
  };
}

function readStoredDeployments(value: unknown): LinkAppDeployment[] {
  return Array.isArray(value)
    ? value.map(readStoredDeployment).filter((deployment): deployment is LinkAppDeployment => Boolean(deployment))
    : [];
}

function readStoredDeployment(value: unknown): LinkAppDeployment | null {
  if (!isRecord(value)) return null;
  const id = normalizeOptionalString(value.id);
  const appId = normalizeOptionalString(value.appId ?? value.app_id);
  const versionId = normalizeOptionalString(value.versionId ?? value.version_id);
  if (!id || !appId || !versionId) return null;
  const createdAt = normalizeOptionalString(value.createdAt ?? value.created_at) || new Date().toISOString();
  return {
    id,
    appId,
    versionId,
    target: normalizeDeploymentTarget(value.target),
    status: normalizeDeploymentStatus(value.status),
    sourceRepo: normalizeOptionalString(value.sourceRepo ?? value.source_repo),
    sourceRef: normalizeOptionalString(value.sourceRef ?? value.source_ref) || "main",
    sourceSubdir: normalizeOptionalString(value.sourceSubdir ?? value.source_subdir) || ".",
    url: normalizeOptionalString(value.url) || undefined,
    logUrl: normalizeOptionalString(value.logUrl ?? value.log_url) || undefined,
    message: normalizeOptionalString(value.message),
    logs: normalizeOptionalString(value.logs) || undefined,
    createdAt,
    updatedAt: normalizeOptionalString(value.updatedAt ?? value.updated_at) || createdAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
    installCommand: normalizeOptionalString(build.install_command ?? build.installCommand) || undefined,
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

function normalizePublisherStatus(value: unknown): LinkAppPublisherStatus {
  const normalized = normalizeOptionalString(value);
  if (["submitted", "building", "preview", "approved", "rejected", "failed", "deprecated"].includes(normalized)) {
    return normalized as LinkAppPublisherStatus;
  }
  return "submitted";
}

function normalizeDeploymentTarget(value: unknown): LinkAppDeploymentTarget {
  return normalizeOptionalString(value) === "production" ? "production" : "preview";
}

function normalizeDeploymentStatus(value: unknown): LinkAppDeploymentStatus {
  const normalized = normalizeOptionalString(value);
  if (["queued", "running", "succeeded", "failed"].includes(normalized)) return normalized as LinkAppDeploymentStatus;
  return "queued";
}

function normalizePolicyPrincipal(value: string): string {
  return value.trim().toLowerCase();
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

function normalizeOptionalHttpsUrl(value: unknown, label: string): string {
  const normalized = normalizeOptionalString(value).replace(/\/+$/, "");
  if (!normalized) return "";
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${label} must be an HTTPS URL without embedded credentials.`);
  }
  return url.toString().replace(/\/+$/, "");
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
