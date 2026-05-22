import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

import type { EvidenceHandoffPayload } from "../scripts/evidence-handoff.ts";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SCRIPT = join(REPO_ROOT, ".github", "bin", "publish-npm");

const temporaryPaths = new Set<string>();

afterEach(() => {
  for (const path of temporaryPaths) {
    try {
      unlinkSync(path);
    } catch {
      // Best-effort temp cleanup for test-created files.
    }
  }
  temporaryPaths.clear();
});

function createTempFile(prefix: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), "publish-npm-test-"));
  const path = join(tempDir, prefix);
  writeFileSync(path, "", "utf8");
  temporaryPaths.add(path);
  return path;
}

function extractPayloadPath(output: string): string {
  const match = output.match(/evidence handoff payload written to (\S+)/);
  assert.ok(match?.[1], `expected payload path in output, received:\n${output}`);
  return match[1];
}

function readPayload(path: string): EvidenceHandoffPayload {
  return JSON.parse(readFileSync(path, "utf8")) as EvidenceHandoffPayload;
}

function createFakeNpmBin(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "publish-npm-fake-bin-"));
  const npmPath = join(tempDir, "npm");
  writeFileSync(
    npmPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "config" && "$2" == "set" ]]; then
  exit 0
fi
if [[ "$1" == "run" && "$2" == "build" ]]; then
  echo "fake build"
  exit 0
fi
if [[ "$1" == "view" ]]; then
  echo '"0.0.0"'
  exit 0
fi
if [[ "$1" == "publish" ]]; then
  echo "fake publish"
  exit 0
fi
echo "unexpected npm invocation: $*" >&2
exit 1
`,
    "utf8",
  );
  chmodSync(npmPath, 0o755);
  return tempDir;
}

describe("publish-npm evidence bundle verification", () => {
  it("writes a publish-path evidence bundle when the gate is disabled", () => {
    const summaryPath = createTempFile("summary.md");
    const result = spawnSync("bash", [SCRIPT, "tools/typescript"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_STEP_SUMMARY: summaryPath,
        GITHUB_RUN_ID: "123",
        GITHUB_REPOSITORY: "team-telnyx/ai",
        GITHUB_SERVER_URL: "https://github.com",
        PACKAGE_OWNER_ID: "aisling404",
        PUBLISH_DISABLE_INCIDENT_ID: "INC-123",
        PUBLISH_DISABLE_REASON: "manual gate disable",
        PUBLISH_DISABLED_BY: "release-bot",
        PUBLISH_NPM_ENABLED: "false",
        PUBLISH_NPM_GATE_STATE: "disabled",
        RELEASE_ONCALL_GROUP_ID: "release-oncall",
        WORKFLOW_NAME: "publish-npm",
      },
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    const payloadPath = extractPayloadPath(combinedOutput);
    const payload = readPayload(payloadPath);
    const summary = readFileSync(summaryPath, "utf8");

    assert.equal(payload.incidentClass, "publish_path");
    assert.equal(payload.routing.escalationState, "owner_notified");
    assert.equal(payload.metadata.gateState, "disabled");
    assert.equal(payload.routing.owner.id, "aisling404");
    assert.match(summary, /Publish gate disabled/);
    assert.match(summary, /INC-123/);
  });

  it("preserves publish-path evidence when the gate is overridden", () => {
    const summaryPath = createTempFile("override-summary.md");
    const fakeBinDir = createFakeNpmBin();
    const result = spawnSync("bash", [SCRIPT, "plugins/opencode"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_STEP_SUMMARY: summaryPath,
        GITHUB_RUN_ID: "456",
        GITHUB_REPOSITORY: "team-telnyx/ai",
        GITHUB_SERVER_URL: "https://github.com",
        NPM_TOKEN: "test-token",
        PACKAGE_OWNER_ID: "aaronjo-Telnyx",
        PATH: `${fakeBinDir}:${process.env.PATH}`,
        PUBLISH_DISABLE_INCIDENT_ID: "INC-456",
        PUBLISH_DISABLE_REASON: "approved override",
        PUBLISH_DISABLED_BY: "release-bot",
        PUBLISH_NPM_ENABLED: "true",
        PUBLISH_NPM_GATE_STATE: "override",
        RELEASE_ONCALL_GROUP_ID: "release-oncall",
        WORKFLOW_NAME: "publish-npm",
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    const payloadPath = extractPayloadPath(combinedOutput);
    const payload = readPayload(payloadPath);
    const summary = readFileSync(summaryPath, "utf8");

    assert.equal(payload.incidentClass, "publish_path");
    assert.equal(payload.routing.escalationState, "oncall_notified");
    assert.equal(payload.metadata.gateState, "override");
    assert.equal(payload.routing.owner.id, "aaronjo-Telnyx");
    assert.match(summary, /Publish gate override recorded/);
    assert.match(combinedOutput, /Publishing @telnyx\/opencode@/);
  });
});
