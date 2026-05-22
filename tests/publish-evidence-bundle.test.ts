import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const publishScript = join(repoRoot, ".github", "bin", "publish-npm");
const writeEvidenceScript = join(repoRoot, ".github", "bin", "write-publish-alert-evidence.mjs");

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

describe("publish evidence bundle wiring", () => {
  it("writes one machine-readable evidence bundle from the publish wrapper", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "publish-evidence-"));
    const packageDir = join(tempDir, "packages", "demo");
    const fakeBinDir = join(tempDir, "fake-bin");
    const tempPublishScript = join(tempDir, ".github", "bin", "publish-npm");
    const tempWriteEvidenceScript = join(tempDir, ".github", "bin", "write-publish-alert-evidence.mjs");
    mkdirSync(packageDir, { recursive: true });
    mkdirSync(fakeBinDir, { recursive: true });
    mkdirSync(dirname(tempPublishScript), { recursive: true });
    writeFileSync(tempPublishScript, readFileSync(publishScript, "utf8"));
    writeFileSync(tempWriteEvidenceScript, readFileSync(writeEvidenceScript, "utf8"));
    chmodSync(tempPublishScript, 0o755);

    writeFileSync(
      join(packageDir, "package.json"),
      JSON.stringify({ name: "@telnyx/demo", version: "1.2.3", scripts: { build: "echo build" } }, null, 2),
    );

    execFileSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "Test User"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init"], { cwd: tempDir, stdio: "ignore" });

    const npmLogPath = join(tempDir, "npm-log.txt");
    writeExecutable(
      join(fakeBinDir, "npm"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${npmLogPath}"
if [[ "$1 $2" == "run build" ]]; then
  exit 0
fi
if [[ "$1 $2 $3 $4" == "view @telnyx/demo maintainers --json" ]]; then
  echo '[{"name":"release-bot","email":"bot@example.com"}]'
  exit 0
fi
if [[ "$1 $2 $3 $4" == "view @telnyx/demo version --json" ]]; then
  echo '"1.2.2"'
  exit 0
fi
if [[ "$1" == "publish" ]]; then
  exit 0
fi
if [[ "$1" == "config" ]]; then
  exit 0
fi
echo "unexpected npm invocation: $*" >&2
exit 1
`,
    );

    const env = {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
      GITHUB_REPOSITORY: "team-telnyx/ai",
      GITHUB_RUN_ID: "123456789",
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_WORKFLOW: "Publish npm",
      GITHUB_WORKFLOW_REF: "team-telnyx/ai/.github/workflows/publish-npm.yml@refs/heads/main",
      GITHUB_WORKFLOW_SHA: "abcdef1234567890",
      GITHUB_SHA: "abcdef1234567890",
      GITHUB_REF_NAME: "main",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc-token",
    };

    execFileSync("bash", [tempPublishScript, packageDir], {
      cwd: tempDir,
      env,
      stdio: "ignore",
    });

    const bundlePath = join(tempDir, ".github", "artifacts", "publish-alert-evidence", "telnyx-demo-1.2.3.json");
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));

    assert.equal(bundle.event_type, "npm_publish_alert");
    assert.equal(bundle.package_name, "@telnyx/demo");
    assert.equal(bundle.package_path, packageDir);
    assert.equal(bundle.package_version, "1.2.3");
    assert.equal(bundle.registry_name, "npm");
    assert.equal(bundle.detector_id, "github-actions:publish-npm");
    assert.equal(bundle.provenance_mode, "github_actions_oidc");
    assert.equal(bundle.missing_owner_state_snapshot, false);
    assert.equal(bundle.owner_state_snapshot.owners[0].name, "release-bot");
    assert.equal(bundle.containment_state.publish_result, "success");
    assert.match(bundle.artifact_hash, /^sha256:[0-9a-f]{64}$/);
    assert.ok(
      bundle.artifact_urls.includes("https://github.com/team-telnyx/ai/actions/runs/123456789"),
      "bundle should include the workflow run URL",
    );

    const npmLog = readFileSync(npmLogPath, "utf8");
    assert.match(npmLog, /run build/);
    assert.match(npmLog, /view @telnyx\/demo maintainers --json/);
    assert.match(npmLog, /publish --access public --no-git-checks --tag latest/);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
