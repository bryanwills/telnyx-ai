#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      ...options,
    }).trim();
  } catch {
    return "";
  }
}

function envValue(name) {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function withMissing(key, value, fallback = "unknown") {
  const missing = value == null || value === "";
  return {
    [key]: missing ? fallback : value,
    [`missing_${key}`]: missing,
  };
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const [packageDirArg, outputPathArg, publishResultArg] = process.argv.slice(2);

if (!packageDirArg || !outputPathArg) {
  console.error("Usage: write-publish-alert-evidence.mjs <package-dir> <output-path> [publish-result]");
  process.exit(1);
}

const packageDir = resolve(packageDirArg);
const outputPath = resolve(outputPathArg);
const publishResult = publishResultArg || "unknown";
const packageJson = JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8"));

const repository = envValue("GITHUB_REPOSITORY");
const runId = envValue("GITHUB_RUN_ID");
const runAttempt = envValue("GITHUB_RUN_ATTEMPT");
const serverUrl = envValue("GITHUB_SERVER_URL") || "https://github.com";
const workflowName = envValue("GITHUB_WORKFLOW");
const workflowRef = envValue("GITHUB_WORKFLOW_REF");
const workflowSha = envValue("GITHUB_WORKFLOW_SHA");
const commitSha = envValue("GITHUB_SHA") || run("git", ["rev-parse", "HEAD"], { cwd: packageDir });
const commitBranch =
  envValue("GITHUB_HEAD_REF") ||
  envValue("GITHUB_REF_NAME") ||
  run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: packageDir });
const commitAuthor = run("git", ["log", "-1", "--pretty=%an <%ae>"], { cwd: packageDir });

const ownerSnapshotRaw = parseJson(envValue("NPM_PACKAGE_MAINTAINERS_JSON"));
const ownerSnapshot =
  ownerSnapshotRaw && Array.isArray(ownerSnapshotRaw)
    ? {
        source: "npm_view_maintainers",
        fetched_at_utc: new Date().toISOString(),
        owners: ownerSnapshotRaw.map((owner) => ({
          name: owner?.name ?? "unknown",
          email: owner?.email ?? "unknown",
        })),
      }
    : {
        source: "unavailable",
        fetched_at_utc: new Date().toISOString(),
        owners: [],
        note: "Maintainer snapshot unavailable from workflow-visible npm metadata.",
      };

const artifactUrls = [];
if (repository && runId) {
  artifactUrls.push(`${serverUrl}/${repository}/actions/runs/${runId}`);
}
if (repository && workflowRef && workflowSha) {
  artifactUrls.push(`${serverUrl}/${repository}/blob/${workflowSha}/${workflowRef.split("@")[0]}`);
}
artifactUrls.push(outputPath);

const provenanceMode = envValue("PUBLISH_PROVENANCE_MODE") || "unknown";
const credentialSource = envValue("PUBLISH_CREDENTIAL_SOURCE") || "unknown";
const containmentState = {
  status: publishResult === "success" ? "monitoring" : publishResult === "skipped" ? "not_required" : "needs_triage",
  owner: "release-engineering",
  credential_source: credentialSource,
  registry_webhook_configured: false,
  publish_result: publishResult,
  notes:
    publishResult === "success"
      ? "No automated containment action was required at publish time."
      : "Publish did not complete successfully; human follow-up may be required.",
};

const payload = {
  ...withMissing("timestamp_utc", new Date().toISOString()),
  event_type: "npm_publish_alert",
  missing_event_type: false,
  detector_id: "github-actions:publish-npm",
  missing_detector_id: false,
  package_name: packageJson.name ?? "unknown",
  missing_package_name: !packageJson.name,
  package_path: packageDirArg,
  missing_package_path: !packageDirArg,
  package_version: packageJson.version ?? "unknown",
  missing_package_version: !packageJson.version,
  registry_name: "npm",
  missing_registry_name: false,
  ...withMissing("ci_workflow", workflowName),
  ...withMissing("ci_run_id", runId),
  ...withMissing("commit_sha", commitSha),
  ...withMissing("commit_author", commitAuthor),
  ...withMissing("commit_branch", commitBranch),
  artifact_urls: artifactUrls,
  missing_artifact_urls: artifactUrls.length === 0,
  artifact_hash: "pending",
  missing_artifact_hash: false,
  provenance_mode: provenanceMode,
  missing_provenance_mode: provenanceMode === "unknown",
  owner_state_snapshot: ownerSnapshot,
  missing_owner_state_snapshot: ownerSnapshot.source === "unavailable",
  containment_state: containmentState,
  missing_containment_state: false,
};

const digestPayload = { ...payload, artifact_hash: "sha256:pending" };
const artifactHash = `sha256:${createHash("sha256").update(JSON.stringify(digestPayload)).digest("hex")}`;
payload.artifact_hash = artifactHash;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
