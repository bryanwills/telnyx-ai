import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildPublishPathPayload,
  buildSecretExposurePayload,
  loadCodeownersText,
} from "./evidence-handoff.ts";
import type { ScanReport } from "./publish-secret-scan.ts";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function writePayloadIfRequested(payload: unknown) {
  const outputPath = process.env.EVIDENCE_OUTPUT_PATH;
  const json = JSON.stringify(payload, null, 2);
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${json}\n`, "utf8");
  }
  console.log(json);
}

function buildPublishPathFromEnv() {
  return buildPublishPathPayload({
    packageName: getRequiredEnv("EVIDENCE_PACKAGE_NAME"),
    packageDir: getRequiredEnv("EVIDENCE_PACKAGE_DIR"),
    workflow: process.env.EVIDENCE_WORKFLOW_NAME || "publish-npm",
    actor: process.env.EVIDENCE_ACTOR || "unknown",
    incidentId: getRequiredEnv("EVIDENCE_INCIDENT_ID"),
    reason: getRequiredEnv("EVIDENCE_REASON"),
    timestampUtc: process.env.EVIDENCE_TIMESTAMP_UTC,
    gateState: (process.env.EVIDENCE_GATE_STATE as "enabled" | "disabled" | "override") || "disabled",
    ownerId: process.env.EVIDENCE_OWNER_ID,
    ownerContactTarget: process.env.EVIDENCE_OWNER_CONTACT_TARGET,
    onCallGroupId: process.env.EVIDENCE_ONCALL_GROUP_ID,
    codeownersText: loadCodeownersText(process.env.EVIDENCE_CODEOWNERS_PATH),
    workflowSummaryPath: process.env.EVIDENCE_WORKFLOW_SUMMARY_PATH,
    auditLogPath: process.env.EVIDENCE_AUDIT_LOG_PATH,
    runUrl: process.env.EVIDENCE_RUN_URL,
  });
}

function buildSecretExposureFromEnv() {
  const reportPath = getRequiredEnv("EVIDENCE_SCAN_REPORT_PATH");
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as ScanReport;
  return buildSecretExposurePayload({
    packageName: getRequiredEnv("EVIDENCE_PACKAGE_NAME"),
    packageDir: getRequiredEnv("EVIDENCE_PACKAGE_DIR"),
    workflow: process.env.EVIDENCE_WORKFLOW_NAME || "publish-npm",
    actor: process.env.EVIDENCE_ACTOR || "unknown",
    incidentId: getRequiredEnv("EVIDENCE_INCIDENT_ID"),
    reason: getRequiredEnv("EVIDENCE_REASON"),
    timestampUtc: process.env.EVIDENCE_TIMESTAMP_UTC,
    ownerId: process.env.EVIDENCE_OWNER_ID,
    ownerContactTarget: process.env.EVIDENCE_OWNER_CONTACT_TARGET,
    onCallGroupId: process.env.EVIDENCE_ONCALL_GROUP_ID,
    codeownersText: loadCodeownersText(process.env.EVIDENCE_CODEOWNERS_PATH),
    runUrl: process.env.EVIDENCE_RUN_URL,
    scanReportPath: reportPath,
    report,
  });
}

function main() {
  const mode = process.argv[2];
  if (mode === "publish-path") {
    writePayloadIfRequested(buildPublishPathFromEnv());
    return;
  }
  if (mode === "secret-exposure") {
    writePayloadIfRequested(buildSecretExposureFromEnv());
    return;
  }
  throw new Error(`Unsupported evidence handoff mode: ${mode}`);
}

main();
