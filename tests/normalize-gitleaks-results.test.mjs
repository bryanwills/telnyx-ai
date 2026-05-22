import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, ".github/scripts/normalize-gitleaks-results.mjs");
const inventoryPath = join(repoRoot, "docs/tel-36-ai-tooling-package-inventory.json");

test("routes unconfirmed guide findings to owner without CTO escalation", () => {
  const output = runNormalizer([
    {
      RuleID: "generic-api-key",
      Description: "Generic token leak",
      File: "guides/ai-assistants.md",
      StartLine: 12,
      Secret: "abcd1234secret",
      Match: "api_key=abcd1234secret"
    }
  ]);

  assert.equal(output.length, 1);
  assert.equal(output[0].owner_route.route_key, "docs-guides");
  assert.equal(output[0].triage_state, "owner_routed");
  assert.equal(output[0].escalation.required, false);
  assert.equal(output[0].classification.finding_class, "unconfirmed_secret");
  assert.ok(!JSON.stringify(output[0]).includes("abcd1234secret"));
});

test("confirmed live findings escalate to CTO", () => {
  const output = runNormalizer([
    {
      RuleID: "aws-access-token",
      Description: "Validated AWS token",
      File: "tools/python/examples/openai/main.py",
      StartLine: 8,
      Secret: "AKIAIOSFODNN7EXAMPLE",
      Match: "key=AKIAIOSFODNN7EXAMPLE",
      validation_status: "live"
    }
  ]);

  assert.equal(output[0].owner_route.route_key, "python-sdk");
  assert.equal(output[0].triage_state, "cto_escalated");
  assert.equal(output[0].escalation.reason, "confirmed_live_credential");
  assert.equal(output[0].classification.validation_status, "confirmed_live");
});

test("publish credential class escalates without live confirmation", () => {
  const output = runNormalizer([
    {
      RuleID: "npm-token",
      Description: "npm publish token",
      File: "plugins/opencode/README.md",
      StartLine: 4,
      Secret: "npm_super_secret_token",
      Match: "NPM_TOKEN=npm_super_secret_token"
    }
  ]);

  assert.equal(output[0].owner_route.route_key, "plugin-opencode");
  assert.equal(output[0].triage_state, "cto_escalated");
  assert.equal(output[0].escalation.reason, "publish_credential_class");
  assert.equal(output[0].classification.finding_class, "publish_credential");
});

test("non-targeted paths are omitted from the jsonl output", () => {
  const output = runNormalizer([
    {
      RuleID: "generic-api-key",
      Description: "Token in node_modules should not emit",
      File: "node_modules/example/index.js",
      StartLine: 1,
      Secret: "skipme123",
      Match: "skipme123"
    }
  ]);

  assert.equal(output.length, 0);
});

function runNormalizer(findings) {
  const tempDir = mkdtempSync(join(tmpdir(), "normalize-gitleaks-results-"));
  const inputPath = join(tempDir, "gitleaks-report.json");
  const outputPath = join(tempDir, "secret-scan-results.jsonl");

  writeFileSync(inputPath, JSON.stringify(findings), "utf8");
  execFileSync("node", [
    scriptPath,
    "--repoRoot",
    repoRoot,
    "--input",
    inputPath,
    "--inventory",
    inventoryPath,
    "--output",
    outputPath
  ]);

  const raw = readOutput(outputPath);
  rmSync(tempDir, { recursive: true, force: true });
  return raw;
}

function readOutput(outputPath) {
  const raw = readFileSync(outputPath, "utf8").trim();
  if (!raw) return [];
  return raw.split("\n").map((line) => JSON.parse(line));
}
