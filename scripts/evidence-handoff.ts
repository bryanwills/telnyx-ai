import { readFileSync } from "node:fs";

import type { ScanReport, SecretFinding } from "./publish-secret-scan.ts";

export type IncidentClass = "publish_path" | "secret_exposure";
export type EscalationState = "owner_notified" | "oncall_notified" | "cto_notified";
export type OwnerResolutionState = "resolved_owner" | "fallback_owner";
export type ConfidenceLevel = "low" | "medium" | "high" | "critical";
export type EvidenceReferenceType = "workflow_summary" | "audit_log" | "scan_report" | "secret_finding";

export interface OwnerIdentity {
  id: string;
  contactTarget: string;
}

export interface OwnerResolution {
  state: OwnerResolutionState;
  owner: OwnerIdentity;
  source: "explicit" | "codeowners" | "fallback";
  reason?: string;
}

export interface ConfidenceMetadata {
  level: ConfidenceLevel;
  source: string;
  score?: number;
}

export interface EvidenceReference {
  type: EvidenceReferenceType;
  label: string;
  path?: string;
  url?: string;
  line?: number;
  findingId?: string;
  fingerprint?: string;
  classification?: string;
  severity?: SecretFinding["severity"];
  confidence?: SecretFinding["confidence"];
}

export interface EvidenceHandoffPayload {
  schemaVersion: "1";
  incidentClass: IncidentClass;
  workflow: string;
  packageName: string;
  incidentId: string;
  timestampUtc: string;
  actor: string;
  reason: string;
  routing: {
    owner: OwnerIdentity;
    ownerResolutionState: OwnerResolutionState;
    ownerResolutionSource: OwnerResolution["source"];
    onCallGroupId: string;
    ackDeadlineUtc: string;
    escalationState: EscalationState;
  };
  confidence: ConfidenceMetadata;
  evidenceReferences: EvidenceReference[];
  metadata: {
    fallbackOwnerUsed: boolean;
    ownerResolutionReason?: string;
    gateState?: "enabled" | "disabled" | "override";
    summary?: Record<string, number | string | boolean>;
  };
}

export interface PublishPathPayloadInput {
  packageName: string;
  packageDir: string;
  workflow: string;
  actor: string;
  incidentId: string;
  reason: string;
  timestampUtc?: string;
  gateState: "enabled" | "disabled" | "override";
  ownerId?: string;
  ownerContactTarget?: string;
  onCallGroupId?: string;
  codeownersText?: string;
  workflowSummaryPath?: string;
  auditLogPath?: string;
  runUrl?: string;
}

export interface SecretExposurePayloadInput {
  packageName: string;
  packageDir: string;
  workflow: string;
  actor: string;
  incidentId: string;
  reason: string;
  report: ScanReport;
  timestampUtc?: string;
  ownerId?: string;
  ownerContactTarget?: string;
  onCallGroupId?: string;
  codeownersText?: string;
  runUrl?: string;
  scanReportPath?: string;
}

const DEFAULT_ONCALL_GROUP_ID = "release-oncall";
const DEFAULT_FALLBACK_OWNER = "release-oncall";
const DEFAULT_FALLBACK_CONTACT = "group:release-oncall";
const VALID_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const VALID_CONTACT_PATTERN = /^(?:github:@[A-Za-z0-9-]+|group:[A-Za-z0-9._-]+|mailto:[^@\s]+@[^@\s]+\.[^@\s]+)$/;

type CodeownerEntry = {
  pattern: string;
  owners: string[];
};

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/^\.?\//, "");
}

function isValidOwner(ownerId: string | undefined): ownerId is string {
  return Boolean(ownerId && VALID_OWNER_PATTERN.test(ownerId));
}

function isValidContactTarget(contactTarget: string | undefined): contactTarget is string {
  return Boolean(contactTarget && VALID_CONTACT_PATTERN.test(contactTarget));
}

function deriveGithubContactTarget(ownerId: string): string {
  return `github:@${ownerId}`;
}

function parseCodeowners(codeownersText: string): CodeownerEntry[] {
  return codeownersText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const parts = line.split(/\s+/).filter(Boolean);
      return {
        pattern: parts[0],
        owners: parts.slice(1).map((owner) => owner.replace(/^@/, "")).filter(isValidOwner),
      };
    })
    .filter((entry) => entry.owners.length > 0);
}

function codeownersPatternMatches(pattern: string, path: string): boolean {
  if (pattern === "*") {
    return true;
  }

  const normalizedPattern = normalizePath(pattern).replace(/\/$/, "");
  const normalizedPath = normalizePath(path);

  if (pattern.endsWith("/")) {
    return normalizedPath.startsWith(`${normalizedPattern}/`) || normalizedPath === normalizedPattern;
  }

  if (normalizedPattern.includes("*")) {
    const regex = new RegExp(`^${normalizedPattern.split("*").map(escapeRegExp).join(".*")}$`);
    return regex.test(normalizedPath);
  }

  return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveOwnerFromCodeowners(packageDir: string, codeownersText?: string): OwnerResolution | null {
  if (!codeownersText) {
    return null;
  }

  const entries = parseCodeowners(codeownersText);
  const normalizedPackageDir = normalizePath(packageDir).replace(/\/$/, "");
  let bestEntry: CodeownerEntry | null = null;

  for (const entry of entries) {
    if (!codeownersPatternMatches(entry.pattern, normalizedPackageDir)) {
      continue;
    }
    if (!bestEntry || entry.pattern.length >= bestEntry.pattern.length) {
      bestEntry = entry;
    }
  }

  if (!bestEntry) {
    return null;
  }

  const ownerId = bestEntry.owners[0];
  return {
    state: "fallback_owner",
    owner: {
      id: ownerId,
      contactTarget: deriveGithubContactTarget(ownerId),
    },
    source: "codeowners",
    reason: `resolved from CODEOWNERS pattern ${bestEntry.pattern}`,
  };
}

export function resolveOwner(input: {
  packageDir: string;
  ownerId?: string;
  ownerContactTarget?: string;
  codeownersText?: string;
}): OwnerResolution {
  if (isValidOwner(input.ownerId)) {
    return {
      state: "resolved_owner",
      owner: {
        id: input.ownerId,
        contactTarget: isValidContactTarget(input.ownerContactTarget)
          ? input.ownerContactTarget
          : deriveGithubContactTarget(input.ownerId),
      },
      source: "explicit",
      reason: isValidContactTarget(input.ownerContactTarget) ? undefined : "derived github contact target from explicit owner",
    };
  }

  const codeownersResolution = resolveOwnerFromCodeowners(input.packageDir, input.codeownersText);
  if (codeownersResolution) {
    return {
      ...codeownersResolution,
      reason: input.ownerId ? `invalid explicit owner "${input.ownerId}"; ${codeownersResolution.reason}` : codeownersResolution.reason,
    };
  }

  return {
    state: "fallback_owner",
    owner: {
      id: DEFAULT_FALLBACK_OWNER,
      contactTarget: DEFAULT_FALLBACK_CONTACT,
    },
    source: "fallback",
    reason: input.ownerId ? `invalid explicit owner "${input.ownerId}" and no CODEOWNERS match` : "missing owner and no CODEOWNERS match",
  };
}

function getAckMinutes(incidentClass: IncidentClass, escalationState: EscalationState): number {
  if (incidentClass === "publish_path") {
    if (escalationState === "owner_notified") return 10;
    if (escalationState === "oncall_notified") return 20;
    return 30;
  }

  if (escalationState === "owner_notified") return 5;
  if (escalationState === "oncall_notified") return 10;
  return 15;
}

function addMinutes(timestampUtc: string, minutes: number): string {
  const time = new Date(timestampUtc);
  time.setUTCMinutes(time.getUTCMinutes() + minutes);
  return time.toISOString();
}

function buildBasePayload(input: {
  incidentClass: IncidentClass;
  workflow: string;
  packageName: string;
  incidentId: string;
  actor: string;
  reason: string;
  timestampUtc?: string;
  packageDir: string;
  ownerId?: string;
  ownerContactTarget?: string;
  onCallGroupId?: string;
  codeownersText?: string;
  escalationState: EscalationState;
  confidence: ConfidenceMetadata;
  evidenceReferences: EvidenceReference[];
  metadata?: EvidenceHandoffPayload["metadata"];
}): EvidenceHandoffPayload {
  const timestampUtc = input.timestampUtc ?? new Date().toISOString();
  const ownerResolution = resolveOwner({
    packageDir: input.packageDir,
    ownerId: input.ownerId,
    ownerContactTarget: input.ownerContactTarget,
    codeownersText: input.codeownersText,
  });

  const payload: EvidenceHandoffPayload = {
    schemaVersion: "1",
    incidentClass: input.incidentClass,
    workflow: input.workflow,
    packageName: input.packageName,
    incidentId: input.incidentId,
    timestampUtc,
    actor: input.actor,
    reason: input.reason,
    routing: {
      owner: ownerResolution.owner,
      ownerResolutionState: ownerResolution.state,
      ownerResolutionSource: ownerResolution.source,
      onCallGroupId: input.onCallGroupId || DEFAULT_ONCALL_GROUP_ID,
      ackDeadlineUtc: addMinutes(timestampUtc, getAckMinutes(input.incidentClass, input.escalationState)),
      escalationState: input.escalationState,
    },
    confidence: input.confidence,
    evidenceReferences: input.evidenceReferences,
    metadata: {
      fallbackOwnerUsed: ownerResolution.state === "fallback_owner",
      ownerResolutionReason: ownerResolution.reason,
      ...input.metadata,
    },
  };

  validateEvidenceHandoffPayload(payload);
  return payload;
}

export function buildPublishPathPayload(input: PublishPathPayloadInput): EvidenceHandoffPayload {
  const evidenceReferences: EvidenceReference[] = [
    {
      type: "workflow_summary",
      label: "GitHub Actions workflow context",
      path: input.workflowSummaryPath,
      url: input.runUrl,
    },
  ];
  if (input.auditLogPath) {
    evidenceReferences.push({
      type: "audit_log",
      label: "publish gate audit log",
      path: input.auditLogPath,
    });
  }

  return buildBasePayload({
    incidentClass: "publish_path",
    workflow: input.workflow,
    packageName: input.packageName,
    incidentId: input.incidentId,
    actor: input.actor,
    reason: input.reason,
    timestampUtc: input.timestampUtc,
    packageDir: input.packageDir,
    ownerId: input.ownerId,
    ownerContactTarget: input.ownerContactTarget,
    onCallGroupId: input.onCallGroupId,
    codeownersText: input.codeownersText,
    escalationState: input.gateState === "override" ? "oncall_notified" : "owner_notified",
    confidence: {
      level: input.gateState === "override" ? "critical" : "high",
      source: "publish_gate",
      score: input.gateState === "override" ? 1 : 0.95,
    },
    evidenceReferences,
    metadata: {
      gateState: input.gateState,
      summary: {
        gateDisabled: input.gateState === "disabled",
        gateOverride: input.gateState === "override",
      },
    },
  });
}

function findingToEvidenceReference(finding: SecretFinding): EvidenceReference {
  return {
    type: "secret_finding",
    label: `${finding.secretClass} in ${finding.path}:${finding.line}`,
    path: finding.path,
    line: finding.line,
    findingId: finding.findingId,
    fingerprint: finding.evidenceFingerprint,
    classification: finding.secretClass,
    severity: finding.severity,
    confidence: finding.confidence,
  };
}

export function buildSecretExposurePayload(input: SecretExposurePayloadInput): EvidenceHandoffPayload {
  const findings = input.report.findings.filter((finding) => !finding.suppression);
  const highestSeverity = findings.some((finding) => finding.severity === "critical")
    ? "critical"
    : findings.some((finding) => finding.severity === "high")
      ? "high"
      : "medium";

  const evidenceReferences: EvidenceReference[] = [
    {
      type: "scan_report",
      label: "release artifact secret scan report",
      path: input.scanReportPath,
      url: input.runUrl,
    },
    ...findings.map(findingToEvidenceReference),
  ];

  return buildBasePayload({
    incidentClass: "secret_exposure",
    workflow: input.workflow,
    packageName: input.packageName,
    incidentId: input.incidentId,
    actor: input.actor,
    reason: input.reason,
    timestampUtc: input.timestampUtc,
    packageDir: input.packageDir,
    ownerId: input.ownerId,
    ownerContactTarget: input.ownerContactTarget,
    onCallGroupId: input.onCallGroupId,
    codeownersText: input.codeownersText,
    escalationState: "oncall_notified",
    confidence: {
      level: highestSeverity,
      source: "publish_secret_scan",
      score: findings.length > 0 ? 0.95 : 0.5,
    },
    evidenceReferences,
    metadata: {
      summary: {
        filesScanned: input.report.summary.filesScanned,
        findings: input.report.summary.findings,
        blockingFindings: input.report.summary.blockingFindings,
        suppressedFindings: input.report.summary.suppressedFindings,
      },
    },
  });
}

export function validateEvidenceHandoffPayload(payload: EvidenceHandoffPayload): void {
  if (payload.schemaVersion !== "1") {
    throw new Error(`Unsupported evidence handoff schema version: ${payload.schemaVersion}`);
  }
  if (!["publish_path", "secret_exposure"].includes(payload.incidentClass)) {
    throw new Error(`Unsupported incident class: ${payload.incidentClass}`);
  }
  if (!payload.workflow || !payload.packageName || !payload.incidentId || !payload.actor || !payload.reason) {
    throw new Error("Evidence handoff payload is missing required top-level fields");
  }
  if (!isValidOwner(payload.routing.owner.id)) {
    throw new Error(`Invalid routing owner id: ${payload.routing.owner.id}`);
  }
  if (!isValidContactTarget(payload.routing.owner.contactTarget)) {
    throw new Error(`Invalid routing contact target: ${payload.routing.owner.contactTarget}`);
  }
  if (!payload.routing.onCallGroupId) {
    throw new Error("Missing on-call group id");
  }
  if (Number.isNaN(Date.parse(payload.timestampUtc)) || Number.isNaN(Date.parse(payload.routing.ackDeadlineUtc))) {
    throw new Error("Evidence handoff payload contains invalid timestamps");
  }
  if (!Array.isArray(payload.evidenceReferences) || payload.evidenceReferences.length === 0) {
    throw new Error("Evidence handoff payload must include at least one evidence reference");
  }

  for (const reference of payload.evidenceReferences) {
    if (!reference.type || !reference.label) {
      throw new Error("Evidence reference is missing type or label");
    }
  }
}

export function loadCodeownersText(path = ".github/CODEOWNERS"): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
