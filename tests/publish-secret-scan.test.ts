import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { scanPaths } from "../scripts/publish-secret-scan.ts";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, "fixtures", "publish-secret-scan");

describe("publish secret scan fixtures", () => {
  it("detects representative positive fixtures at or above 80% coverage", () => {
    const report = scanPaths([
      "tests/fixtures/publish-secret-scan/docs",
      "tests/fixtures/publish-secret-scan/examples",
      "tests/fixtures/publish-secret-scan/templates",
      "tests/fixtures/publish-secret-scan/artifacts",
    ], join(__dirname, ".."));

    const positivePaths = new Set([
      "tests/fixtures/publish-secret-scan/docs/github-token.md",
      "tests/fixtures/publish-secret-scan/examples/npm-token.ts",
      "tests/fixtures/publish-secret-scan/templates/aws-key.tpl",
      "tests/fixtures/publish-secret-scan/artifacts/env-secret.env",
      "tests/fixtures/publish-secret-scan/artifacts/suppressed-secret.env",
    ]);
    const hitPaths = new Set(
      report.findings
        .map((finding) => finding.path)
        .filter((path) => positivePaths.has(path))
    );
    const coverage = hitPaths.size / positivePaths.size;

    assert.ok(
      coverage >= 0.8,
      `expected >=80% fixture coverage, received ${(coverage * 100).toFixed(1)}%`
    );
    assert.equal(coverage, 1);
  });

  it("does not hard-fail placeholder or non-secret fixtures", () => {
    const report = scanPaths([
      "tests/fixtures/publish-secret-scan/negatives",
    ], join(__dirname, ".."));

    assert.equal(report.summary.blockingFindings, 0);
    assert.equal(report.findings.length, 0);
  });

  it("emits deterministic finding ids, evidence fingerprints, and suppression metadata", () => {
    const first = scanPaths([
      "tests/fixtures/publish-secret-scan",
    ], join(__dirname, ".."));
    const second = scanPaths([
      "tests/fixtures/publish-secret-scan",
    ], join(__dirname, ".."));

    assert.deepEqual(first.findings, second.findings);

    for (const finding of first.findings) {
      assert.equal(finding.reportVersion, "1");
      assert.ok(finding.findingId.length > 0);
      assert.ok(finding.evidenceFingerprint.length > 0);
      assert.ok(finding.detectorId.length > 0);
      assert.ok(finding.secretClass.length > 0);
      assert.ok(finding.path.length > 0);
      assert.ok(finding.line > 0);
      assert.ok(finding.sourceSurface.length > 0);
    }

    const suppressed = first.findings.find((finding) => finding.suppression);
    assert.ok(suppressed, "expected a suppressed finding fixture");
    assert.equal(suppressed?.suppression?.kind, "inline");
    assert.match(suppressed?.suppression?.reason || "", /fixture placeholder/i);
  });

  it("never emits raw fixture secret material in the JSON report", () => {
    const report = scanPaths([
      "tests/fixtures/publish-secret-scan",
    ], join(__dirname, ".."));
    const json = JSON.stringify(report);
    const rawSecrets = [
      "ghp_0123456789abcdef0123456789abcdef0123",
      "npm_0123456789abcdef0123456789abcdef0123",
      "AKIA1234567890ABCD12",
      "ProdSecretTokenValue987654321",
    ];

    for (const rawSecret of rawSecrets) {
      assert.equal(json.includes(rawSecret), false, `report leaked raw secret ${rawSecret}`);
    }
  });
});
