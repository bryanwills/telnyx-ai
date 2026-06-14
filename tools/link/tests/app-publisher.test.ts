import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { InMemoryAuditLogger } from "../src/audit.js";
import { parseLinkAppManifestText } from "../src/app-manifest.js";
import { createLinkAppPublisherServer, LinkAppPublisherService, listenLinkAppPublisherServer, TelnyxEdgeCliDeployer, type LinkAppDeploymentRequest } from "../src/app-publisher.js";
import { importLocalLinkApp, inspectLocalLinkApp } from "../src/local-app.js";

const execFileAsync = promisify(execFile);

function publisherService() {
  let nextId = 0;
  return new LinkAppPublisherService({
    idGenerator: () => `test-${++nextId}`,
    now: () => new Date("2026-06-09T12:00:00.000Z"),
  });
}

test("parseLinkAppManifestText reads the flat Plan 3 link-app.yml contract", () => {
  const manifest = parseLinkAppManifestText(`
name: Carrier Readiness Hub
slug: carrier-readiness-hub
description: Review carrier launch gates before customer updates.
owner_squad: messaging-ops.squad
audience: Messaging, NOC
app_type: web
source_repo: https://github.com/team-telnyx/mcp-apps
source_ref: main
source_subdir: apps/carrier-readiness
install_command: npm ci
build_command: npm run build
output_dir: dist
env_schema:
  - TELNYX_API_KEY
  - HINDSIGHT_BANK_ID
access: vpn
reviewers:
  - messaging-ops.squad
  - link-platform.squad
risk_level: medium
`);

  assert.equal(manifest.name, "Carrier Readiness Hub");
  assert.equal(manifest.ownerSquad, "messaging-ops.squad");
  assert.equal(manifest.sourceRepo, "https://github.com/team-telnyx/mcp-apps");
  assert.equal(manifest.sourceSubdir, "apps/carrier-readiness");
  assert.equal(manifest.installCommand, "npm ci");
  assert.equal(manifest.buildCommand, "npm run build");
  assert.equal(manifest.outputDir, "dist");
  assert.equal(manifest.access, "vpn");
  assert.deepEqual(manifest.envSchema, ["TELNYX_API_KEY", "HINDSIGHT_BANK_ID"]);
  assert.deepEqual(manifest.reviewers, ["messaging-ops.squad", "link-platform.squad"]);
});

test("parseLinkAppManifestText accepts nested publisher JSON manifests", () => {
  const manifest = parseLinkAppManifestText(JSON.stringify(publishInput("nested-link-app")), "link-app.json");

  assert.equal(manifest.slug, "nested-link-app");
  assert.equal(manifest.ownerSquad, "messaging-ops.squad");
  assert.equal(manifest.sourceRepo, "https://github.com/team-telnyx/mcp-apps");
  assert.equal(manifest.sourceRef, "main");
  assert.equal(manifest.sourceSubdir, "apps/carrier-readiness");
  assert.equal(manifest.buildCommand, "npm run build");
  assert.equal(manifest.outputDir, "dist");
});

test("inspectLocalLinkApp derives source refs from a local Git app directory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-local-app-"));
  const appDir = path.join(tempDir, "apps", "carrier-readiness");
  try {
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "package.json"), JSON.stringify({
      name: "carrier-readiness",
      description: "Local package fallback description.",
      scripts: { build: "vite build" },
    }, null, 2));
    writeFileSync(path.join(appDir, "link-app.yml"), `
name: Carrier Readiness Hub
owner_squad: messaging-ops.squad
audience: Messaging, NOC
app_type: web
build_command: npm run build
output_dir: dist
env_schema:
  - TELNYX_API_KEY
access: vpn
reviewers:
  - messaging-ops.squad
risk_level: medium
`);
    execFileSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/team-telnyx/mcp-apps"], { cwd: tempDir });
    execFileSync("git", ["add", "."], { cwd: tempDir });
    execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"], {
      cwd: tempDir,
      stdio: "ignore",
    });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tempDir, encoding: "utf8" }).trim();

    const inspection = await inspectLocalLinkApp(appDir);

    assert.equal(inspection.publishInput.sourceRepo, "https://github.com/team-telnyx/mcp-apps");
    assert.equal(inspection.publishInput.sourceRef, head);
    assert.equal(inspection.publishInput.sourceSubdir, "apps/carrier-readiness");
    assert.equal(inspection.publishInput.installCommand, "npm install");
    assert.equal(inspection.publishInput.outputDir, "dist");
    assert.deepEqual(inspection.warnings, []);
    assert.deepEqual(inspection.publisherPayload.source, {
      repo: "https://github.com/team-telnyx/mcp-apps",
      ref: head,
      subdir: "apps/carrier-readiness",
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("inspectLocalLinkApp can require the source ref to be pushed to origin", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-local-app-pushed-ref-"));
  const remoteDir = path.join(tempDir, "remote.git");
  const repoDir = path.join(tempDir, "repo");
  const appDir = path.join(repoDir, "apps", "pushed-ref");
  try {
    execFileSync("git", ["init", "--bare", remoteDir], { stdio: "ignore" });
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "package.json"), JSON.stringify({ name: "pushed-ref", scripts: { build: "vite build" } }, null, 2));
    writeFileSync(path.join(appDir, "link-app.yml"), `
name: Pushed Ref App
owner_squad: link-platform.squad
audience: Link
app_type: web
build_command: npm run build
output_dir: dist
env_schema:
  - TELNYX_API_KEY
access: vpn
reviewers:
  - link-platform.squad
risk_level: low
`);
    execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/team-telnyx/mcp-apps"], { cwd: repoDir });
    execFileSync("git", ["config", `url.${pathToFileURL(remoteDir).href}.insteadOf`, "https://github.com/team-telnyx/mcp-apps"], { cwd: repoDir });
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"], {
      cwd: repoDir,
      stdio: "ignore",
    });
    execFileSync("git", ["push", "origin", "HEAD:refs/heads/main"], { cwd: repoDir, stdio: "ignore" });

    const pushed = await inspectLocalLinkApp(appDir, { requirePushedRef: true });
    assert.equal(pushed.git.remoteRefStatus, "available");
    assert.deepEqual(pushed.warnings, []);

    writeFileSync(path.join(appDir, "README.md"), "local-only change\n");
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "local only"], {
      cwd: repoDir,
      stdio: "ignore",
    });

    await assert.rejects(() => inspectLocalLinkApp(appDir, { requirePushedRef: true }), /source_ref is not present on origin/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("importLocalLinkApp stages a static app into scoped edge-apps without secrets", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-local-app-import-"));
  const sourceDir = path.join(tempDir, "codex-output");
  const repoDir = path.join(tempDir, "repo");
  const destinationRoot = path.join(repoDir, "edge-apps");
  try {
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "index.html"), "<!doctype html><title>Imported App</title><main>ok</main>\n");
    writeFileSync(path.join(sourceDir, ".env"), "TELNYX_API_KEY=should-not-copy\n");
    writeFileSync(path.join(repoDir, "README.md"), "repo\n");
    execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/team-telnyx/link"], { cwd: repoDir });
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"], {
      cwd: repoDir,
      stdio: "ignore",
    });

    const imported = await importLocalLinkApp(sourceDir, {
      destinationRoot,
      scope: "personal",
      slug: "codex-demo",
      name: "Codex Demo",
    });

    assert.equal(imported.scope, "personal");
    assert.equal(imported.publishInput.slug, "codex-demo");
    assert.equal(imported.publishInput.sourceRepo, "https://github.com/team-telnyx/link");
    assert.equal(imported.publishInput.sourceSubdir, "edge-apps/personal/codex-demo");
    assert.equal(imported.publishInput.buildCommand, "node scripts/link-build.mjs");
    assert.equal(imported.publishInput.outputDir, "dist");
    assert.equal(imported.createdManifest, true);
    assert.equal(existsSync(path.join(imported.targetDirectory, ".env")), false);
    assert.match(readFileSync(path.join(imported.targetDirectory, "link-app.yml"), "utf8"), /source_subdir: edge-apps\/personal\/codex-demo/);
    assert.match(imported.warnings.join("\n"), /Generated scripts\/link-build\.mjs/);

    execFileSync(process.execPath, ["scripts/link-build.mjs"], { cwd: imported.targetDirectory, stdio: "ignore" });
    assert.equal(existsSync(path.join(imported.targetDirectory, "dist", "index.html")), true);
    assert.equal(existsSync(path.join(imported.targetDirectory, "dist", "link-app.yml")), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("publisher-e2e-smoke CLI publishes, approves, and duplicates a local app", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-local-app-cli-e2e-"));
  const appDir = path.join(tempDir, "apps", "cli-e2e");
  const server = createLinkAppPublisherServer(publisherService(), { requireAuth: false });
  const listener = await listenLinkAppPublisherServer(server);
  const appUrlServer = createServer((request, response) => {
    response.writeHead(request.url === "/health" ? 204 : 404);
    response.end();
  });
  const appUrlListener = await listenLinkAppPublisherServer(appUrlServer);
  try {
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "package.json"), JSON.stringify({ name: "cli-e2e", scripts: { build: "vite build" } }, null, 2));
    writeFileSync(path.join(appDir, "link-app.yml"), `
name: CLI E2E App
slug: cli-e2e-app
owner_squad: link-platform.squad
audience: Link
app_type: web
build_command: npm run build
output_dir: dist
env_schema:
  - TELNYX_API_KEY
access: vpn
reviewers:
  - link-platform.squad
risk_level: low
`);
    execFileSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/team-telnyx/mcp-apps"], { cwd: tempDir });
    execFileSync("git", ["add", "."], { cwd: tempDir });
    execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"], {
      cwd: tempDir,
      stdio: "ignore",
    });

    const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
    const { stdout } = await execFileAsync(
      tsxBin,
      [
        "src/cli.ts",
        "publisher-e2e-smoke",
        appDir,
        "--publisher-url",
        listener.url,
        "--dev-no-auth",
        "--check-app-url",
        "--app-url-override",
        appUrlListener.url,
        "--app-url-path",
        "/health",
        "--allow-app-statuses",
        "204",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    const payload = JSON.parse(String(stdout)) as {
      ok: boolean;
      publish: { app: { status: string; sourceSubdir: string } };
      review: { app: { status: string } };
      duplicate: { source_subdir: string };
      deploymentLogs: { logs: string; deployment: { target: string; status: string } };
      appUrlCheck: { ok: boolean; status: number; url: string };
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.publish.app.status, "preview");
    assert.equal(payload.publish.app.sourceSubdir, "apps/cli-e2e");
    assert.equal(payload.review.app.status, "approved");
    assert.equal(payload.duplicate.source_subdir, "apps/cli-e2e");
    assert.equal(payload.deploymentLogs.deployment.target, "production");
    assert.equal(payload.deploymentLogs.deployment.status, "succeeded");
    assert.match(payload.deploymentLogs.logs, /record-only mode/);
    assert.equal(payload.appUrlCheck.ok, true);
    assert.equal(payload.appUrlCheck.status, 204);
    assert.match(payload.appUrlCheck.url, /\/health$/);
  } finally {
    await appUrlListener.close();
    await listener.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("publisher-e2e-smoke CLI exercises production Edge deployer wiring with a fake telnyx-edge binary", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-edge-cli-e2e-"));
  const remoteDir = path.join(tempDir, "remote.git");
  const repoDir = path.join(tempDir, "repo");
  const appDir = path.join(repoDir, "apps", "edge-e2e");
  const fakeEdgePath = path.join(tempDir, "telnyx-edge");
  const fakeEdgeLogPath = path.join(tempDir, "edge-calls.log");
  const gitConfigPath = path.join(tempDir, "gitconfig");
  const workspaceRoot = path.join(tempDir, "workspaces");
  const appUrlServer = createServer((request, response) => {
    response.writeHead(request.url === "/health" ? 204 : 404);
    response.end();
  });
  const appUrlListener = await listenLinkAppPublisherServer(appUrlServer);

  try {
    execFileSync("git", ["init", "--bare", remoteDir], { stdio: "ignore" });
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "package.json"), JSON.stringify({
      name: "edge-e2e",
      scripts: {
        build: "node -e \"require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/index.html','ok')\"",
      },
    }, null, 2));
    writeFileSync(path.join(appDir, "link-app.yml"), `
name: Edge E2E App
slug: edge-e2e-app
owner_squad: link-platform.squad
audience: Link
app_type: web
install_command: npm install
build_command: npm run build
output_dir: dist
env_schema:
  - TELNYX_AUTH_CONTEXT
access: vpn
reviewers:
  - link-platform.squad
risk_level: low
`);
    execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/team-telnyx/mcp-apps"], { cwd: repoDir });
    execFileSync("git", ["config", `url.${pathToFileURL(remoteDir).href}.insteadOf`, "https://github.com/team-telnyx/mcp-apps"], { cwd: repoDir });
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"], {
      cwd: repoDir,
      stdio: "ignore",
    });
    execFileSync("git", ["push", "origin", "HEAD:refs/heads/main"], { cwd: repoDir, stdio: "ignore" });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();

    writeFileSync(gitConfigPath, `[url "${pathToFileURL(remoteDir).href}"]\n\tinsteadOf = https://github.com/team-telnyx/mcp-apps\n`);
    writeFileSync(fakeEdgePath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
if (args[0] === "--help") {
  console.log("telnyx-edge fake");
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "status") {
  console.log("Authentication Status: API Key");
  process.exit(0);
}
if (args[0] === "ship") {
  if (process.env.EDGE_FAKE_LOG) fs.appendFileSync(process.env.EDGE_FAKE_LOG, process.cwd() + "\\n");
  console.log("fake edge ship");
  console.log("TELNYX_API_KEY=fake-secret");
  console.log("authorization: bearer fake-live-token");
  console.log("deployed https://edge-e2e-app.apps.telnyx.io");
  process.exit(0);
}
console.error("unexpected telnyx-edge args: " + args.join(" "));
process.exit(2);
`);
    chmodSync(fakeEdgePath, 0o755);

    const service = new LinkAppPublisherService({
      storagePath: path.join(tempDir, "catalog.json"),
      enforceReviewers: true,
      deployer: new TelnyxEdgeCliDeployer({
        workspaceRoot,
        edgeBinary: fakeEdgePath,
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: gitConfigPath,
          EDGE_FAKE_LOG: fakeEdgeLogPath,
        },
        timeoutMs: 60_000,
      }),
    });
    const server = createLinkAppPublisherServer(service, { requireAuth: true, requireAuthContext: true });
    const listener = await listenLinkAppPublisherServer(server);
    try {
      const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
      const { stdout } = await execFileAsync(
        tsxBin,
        [
          "src/cli.ts",
          "publisher-e2e-smoke",
          appDir,
          "--publisher-url",
          listener.url,
          "--token",
          "edge-e2e-token",
          "--reviewer",
          "publisher-e2e@telnyx.com",
          "--reviewer-groups",
          "link-platform.squad",
          "--require-ready",
          "--check-app-url",
          "--app-url-override",
          appUrlListener.url,
          "--app-url-path",
          "/health",
          "--allow-app-statuses",
          "204",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 90_000,
        },
      );
      const payload = JSON.parse(String(stdout)) as {
        ok: boolean;
        readiness: { ready: boolean; deployer: { mode: string } };
        publish: { app: { status: string; sourceRef: string; previewUrl: string }; deployment: { status: string; target: string; url: string } };
        review: { app: { status: string; deployedUrl: string; vpnUrl: string }; deployment: { status: string; target: string; url: string } };
        deploymentLogs: { logs: string; deployment: { target: string; status: string; url: string } };
        duplicate: { source_ref: string; commands: string[]; path: string };
        appUrlCheck: { ok: boolean; status: number };
      };

      assert.equal(payload.ok, true);
      assert.equal(payload.readiness.ready, true);
      assert.equal(payload.readiness.deployer.mode, "telnyx-edge");
      assert.equal(payload.publish.app.status, "preview");
      assert.equal(payload.publish.app.sourceRef, head);
      assert.equal(payload.publish.deployment.status, "succeeded");
      assert.equal(payload.publish.deployment.target, "preview");
      assert.equal(payload.publish.deployment.url, "https://edge-e2e-app.apps.telnyx.io");
      assert.equal(payload.review.app.status, "approved");
      assert.equal(payload.review.app.deployedUrl, "https://edge-e2e-app.apps.telnyx.io");
      assert.equal(payload.review.app.vpnUrl, "https://edge-e2e-app.apps.telnyx.io");
      assert.equal(payload.review.deployment.target, "production");
      assert.equal(payload.review.deployment.status, "succeeded");
      assert.equal(payload.deploymentLogs.deployment.target, "production");
      assert.equal(payload.deploymentLogs.deployment.url, "https://edge-e2e-app.apps.telnyx.io");
      assert.match(payload.deploymentLogs.logs, /fake edge ship/);
      assert.match(payload.deploymentLogs.logs, /TELNYX_API_KEY=\[redacted\]/);
      assert.match(payload.deploymentLogs.logs, /authorization: bearer \[redacted\]/i);
      assert.doesNotMatch(payload.deploymentLogs.logs, /fake-secret|fake-live-token/);
      assert.equal(payload.duplicate.source_ref, head);
      assert.deepEqual(payload.duplicate.commands, [
        "git clone 'https://github.com/team-telnyx/mcp-apps' 'edge-e2e-app'",
        "cd 'edge-e2e-app'",
        `git checkout '${head}'`,
        "cd 'apps/edge-e2e'",
      ]);
      assert.equal(payload.duplicate.path, "edge-e2e-app/apps/edge-e2e");
      assert.equal(payload.appUrlCheck.ok, true);
      assert.equal(payload.appUrlCheck.status, 204);

      const edgeShipCwds = readFileSync(fakeEdgeLogPath, "utf8").trim().split(/\r?\n/);
      assert.equal(edgeShipCwds.length, 2);
      assert.ok(edgeShipCwds.every((cwd) => cwd.endsWith(path.join("source", "apps", "edge-e2e"))));
    } finally {
      await listener.close();
    }
  } finally {
    await appUrlListener.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

function publishInput(slug = "carrier-readiness-hub") {
  return {
    app: {
      name: "Carrier Readiness Hub",
      slug,
      description: "Review carrier launch gates before customer updates.",
      owner_squad: "messaging-ops.squad",
      audience: "Messaging, NOC",
      app_type: "web",
      access: "vpn",
      risk_level: "medium",
      env_schema: ["TELNYX_API_KEY", "HINDSIGHT_BANK_ID"],
      reviewers: ["messaging-ops.squad", "link-platform.squad"],
    },
    source: {
      repo: "https://github.com/team-telnyx/mcp-apps",
      ref: "main",
      subdir: "apps/carrier-readiness",
    },
    build: {
      command: "npm run build",
      output_dir: "dist",
    },
  };
}

test("LinkAppPublisherService creates VPN-only publish intents with preview metadata", () => {
  const auditLogger = new InMemoryAuditLogger();
  const service = new LinkAppPublisherService({
    auditLogger,
    idGenerator: () => "intent-id",
    now: () => new Date("2026-06-09T12:00:00.000Z"),
  });

  const result = service.createPublishIntent(publishInput());

  assert.equal(result.mode, "managed");
  assert.equal(result.app.id, "app-carrier-readiness-hub");
  assert.equal(result.app.access, "vpn");
  assert.equal(result.app.status, "preview");
  assert.equal(result.app.latestVersion.status, "preview");
  assert.equal(result.app.versions.length, 1);
  assert.equal(result.app.latestVersion.deploymentStatus, "succeeded");
  assert.equal(result.app.latestVersion.buildLogUrl, undefined);
  assert.equal(result.app.deployments.length, 1);
  assert.equal(result.deployment?.target, "preview");
  assert.equal(result.deployment?.status, "succeeded");
  assert.equal(result.deployment?.logUrl, undefined);
  assert.equal(result.app.previewUrl, "https://carrier-readiness-hub.link-apps-preview.query.prod.telnyx.io");
  assert.deepEqual(result.review?.reviewers, ["messaging-ops.squad", "link-platform.squad"]);
  assert.ok(auditLogger.all().some((event) => event.eventType === "link_app.publish_intent.created"));
});

test("LinkAppPublisherService uses explicit HTTPS build log bases only", () => {
  const service = new LinkAppPublisherService({
    buildLogBaseUrl: "https://publisher.example.com/logs/",
    idGenerator: () => "log-id",
    now: () => new Date("2026-06-09T12:00:00.000Z"),
  });

  const result = service.createPublishIntent(publishInput("build-log-app"));

  assert.equal(result.app.latestVersion.buildLogUrl, "https://publisher.example.com/logs/version-log-id");
  assert.equal(result.deployment?.logUrl, "https://publisher.example.com/logs/version-log-id");
  assert.throws(
    () => new LinkAppPublisherService({ buildLogBaseUrl: "http://publisher.example.com/logs" }),
    /buildLogBaseUrl must be an HTTPS URL/,
  );
});

test("LinkAppPublisherService versions, reviews, and duplicates source refs without local secrets", () => {
  const service = publisherService();
  service.createPublishIntent(publishInput("release-desk"));

  const versionResult = service.createVersion("app-release-desk", {
    source_repo: "https://github.com/team-telnyx/mcp-apps",
    source_ref: "release-preview",
    source_subdir: "apps/release-desk",
  });
  assert.equal(versionResult.app.status, "preview");
  assert.equal(versionResult.version?.sourceRef, "release-preview");
  assert.equal(versionResult.deployment?.target, "preview");
  assert.equal(versionResult.app.versions.length, 2);
  assert.equal(versionResult.app.deployments.length, 2);

  const reviewResult = service.reviewApp("app-release-desk", {
    decision: "approve",
    reviewer: "link-platform.squad",
    notes: "Approved for private VPN access.",
  });
  assert.equal(reviewResult.app.status, "approved");
  assert.equal(reviewResult.app.vpnUrl, "https://release-desk.apps.telnyx.io");
  assert.equal(reviewResult.version?.reviewedAt, "2026-06-09T12:00:00.000Z");
  assert.equal(reviewResult.deployment?.target, "production");
  assert.equal(reviewResult.deployment?.url, "https://release-desk.apps.telnyx.io");
  assert.equal(reviewResult.app.deployments.length, 3);

  const duplicate = service.duplicateApp("release-desk");
  assert.equal(duplicate.action, "source_ref");
  assert.equal(duplicate.source_ref, "release-preview");
  assert.equal(duplicate.source_subdir, "apps/release-desk");
  assert.deepEqual(duplicate.commands, [
    "git clone 'https://github.com/team-telnyx/mcp-apps' 'release-desk'",
    "cd 'release-desk'",
    "git checkout 'release-preview'",
    "cd 'apps/release-desk'",
  ]);
  assert.equal(duplicate.path, "release-desk/apps/release-desk");
  assert.doesNotMatch(JSON.stringify(duplicate), /\.env|TELNYX_API_KEY=/);
});

test("LinkAppPublisherService supports version history, rollback, ownership transfer, and deprecation", () => {
  const service = publisherService();
  const initial = service.createPublishIntent(publishInput("lifecycle-app"));
  const initialVersionId = initial.version?.id ?? "";
  service.createVersion("app-lifecycle-app", {
    source_repo: "https://github.com/team-telnyx/mcp-apps",
    source_ref: "release-v2",
    source_subdir: "apps/lifecycle-v2",
  });
  service.reviewApp("app-lifecycle-app", { decision: "approve", notes: "ship v2" });

  assert.equal(service.listVersions("lifecycle-app").length, 2);

  const rollback = service.rollbackApp("lifecycle-app", {
    version_id: initialVersionId,
    notes: "Rollback after review.",
  });
  assert.equal(rollback.app.status, "approved");
  assert.equal(rollback.version?.id, initialVersionId);
  assert.equal(rollback.app.sourceRef, "main");
  assert.equal(rollback.deployment?.target, "production");
  assert.equal(rollback.app.deployments.length, 4);

  const transfer = service.transferOwnership("lifecycle-app", {
    owner_squad: "new-owner.squad",
    reviewers: ["new-owner.squad", "link-platform.squad"],
    notes: "Ownership moved to new squad.",
  });
  assert.equal(transfer.app.ownerSquad, "new-owner.squad");
  assert.deepEqual(transfer.app.reviewers, ["new-owner.squad", "link-platform.squad"]);

  const deprecated = service.deprecateApp("lifecycle-app", { notes: "Replaced by another app." });
  assert.equal(deprecated.app.status, "deprecated");
  assert.equal(deprecated.version?.status, "deprecated");
  assert.equal(deprecated.app.latestVersion.status, "deprecated");
});

test("LinkAppPublisherService persists catalog and deployments across restarts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-app-publisher-"));
  const storagePath = path.join(tempDir, "catalog.json");
  try {
    const service = new LinkAppPublisherService({
      storagePath,
      idGenerator: () => "persisted",
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });
    service.createPublishIntent(publishInput("persistent-app"));
    service.reviewApp("persistent-app", { decision: "approve" });

    const restarted = new LinkAppPublisherService({ storagePath });
    const app = restarted.getApp("persistent-app");
    assert.equal(app?.status, "approved");
    assert.equal(app?.vpnUrl, "https://persistent-app.apps.telnyx.io");
    assert.equal(app?.deployments.length, 2);
    assert.deepEqual(restarted.listDeployments("persistent-app").map((deployment) => deployment.target), ["production", "preview"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("LinkAppPublisherService accepts a deployer adapter for real Edge job queues", () => {
  const service = new LinkAppPublisherService({
    idGenerator: () => "queued",
    now: () => new Date("2026-06-09T12:00:00.000Z"),
    deployer: {
      createDeployment(request: LinkAppDeploymentRequest) {
        return {
          id: request.id,
          appId: request.appId,
          versionId: request.version.id,
          target: request.target,
          status: "queued",
          sourceRepo: request.version.sourceRepo,
          sourceRef: request.version.sourceRef,
          sourceSubdir: request.version.sourceSubdir,
          url: request.url,
          logUrl: request.logUrl,
          message: "Queued Edge Compute deployment.",
          createdAt: request.createdAt,
          updatedAt: request.createdAt,
        };
      },
    },
  });

  const result = service.createPublishIntent(publishInput("queued-edge-app"));

  assert.equal(result.deployment?.status, "queued");
  assert.equal(result.app.latestVersion.deploymentStatus, "queued");
  assert.equal(result.app.status, "building");
  assert.equal(service.listDeployments("queued-edge-app")[0].message, "Queued Edge Compute deployment.");
});

test("LinkAppPublisherService uses successful deployment URLs as catalog URLs", () => {
  let nextId = 0;
  const service = new LinkAppPublisherService({
    idGenerator: () => `deployment-url-${++nextId}`,
    now: () => new Date("2026-06-09T12:00:00.000Z"),
    deployer: {
      createDeployment(request: LinkAppDeploymentRequest) {
        const url = request.target === "preview"
          ? "https://preview-actual.apps.telnyx.io"
          : "https://production-actual.apps.telnyx.io";
        return {
          id: request.id,
          appId: request.appId,
          versionId: request.version.id,
          target: request.target,
          status: "succeeded",
          sourceRepo: request.version.sourceRepo,
          sourceRef: request.version.sourceRef,
          sourceSubdir: request.version.sourceSubdir,
          url,
          logUrl: request.logUrl,
          message: `${request.target} deployed`,
          createdAt: request.createdAt,
          updatedAt: request.createdAt,
        };
      },
    },
  });

  const published = service.createPublishIntent(publishInput("deployment-url-app"));
  assert.equal(published.app.previewUrl, "https://preview-actual.apps.telnyx.io");
  assert.equal(published.version?.previewUrl, "https://preview-actual.apps.telnyx.io");

  const reviewed = service.reviewApp("deployment-url-app", { decision: "approve" });
  assert.equal(reviewed.app.status, "approved");
  assert.equal(reviewed.app.vpnUrl, "https://production-actual.apps.telnyx.io");
  assert.equal(reviewed.app.deployedUrl, "https://production-actual.apps.telnyx.io");
  assert.equal(reviewed.version?.deployedUrl, "https://production-actual.apps.telnyx.io");
});

test("LinkAppPublisherService does not expose failed production deployments as VPN URLs", () => {
  let nextId = 0;
  const service = new LinkAppPublisherService({
    idGenerator: () => `failed-production-${++nextId}`,
    now: () => new Date("2026-06-09T12:00:00.000Z"),
    deployer: {
      createDeployment(request: LinkAppDeploymentRequest) {
        const succeeded = request.target === "preview";
        return {
          id: request.id,
          appId: request.appId,
          versionId: request.version.id,
          target: request.target,
          status: succeeded ? "succeeded" : "failed",
          sourceRepo: request.version.sourceRepo,
          sourceRef: request.version.sourceRef,
          sourceSubdir: request.version.sourceSubdir,
          url: succeeded ? "https://failed-production-preview.apps.telnyx.io" : request.url,
          logUrl: request.logUrl,
          message: succeeded ? "preview deployed" : "production deployment failed",
          createdAt: request.createdAt,
          updatedAt: request.createdAt,
        };
      },
    },
  });

  service.createPublishIntent(publishInput("failed-production-app"));
  const reviewed = service.reviewApp("failed-production-app", { decision: "approve" });

  assert.equal(reviewed.app.status, "failed");
  assert.equal(reviewed.version?.status, "failed");
  assert.equal(reviewed.version?.deployedUrl, undefined);
  assert.equal(reviewed.app.deployedUrl, undefined);
  assert.equal(reviewed.app.vpnUrl, undefined);
  assert.equal(reviewed.app.previewUrl, "https://failed-production-preview.apps.telnyx.io");
  assert.equal(reviewed.deployment?.url, "https://failed-production-app.apps.telnyx.io");
});

test("LinkAppPublisherService readiness distinguishes local and production deployers", async () => {
  const localService = new LinkAppPublisherService();
  const localReadiness = localService.readiness();
  assert.equal(localReadiness.ready, false);
  assert.equal(localReadiness.deployer.mode, "record-only");
  assert.ok(localReadiness.checks.some((check) => check.name === "Catalog storage configured" && !check.ok));
  assert.ok(localReadiness.checks.some((check) => check.name === "Production Edge deployer" && !check.ok));

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-app-publisher-ready-"));
  try {
    const deployer = new TelnyxEdgeCliDeployer({
      workspaceRoot: tempDir,
      edgeBinary: "telnyx-edge",
      gitBinary: "git",
      commandRunner: {
        run(command, args) {
          if (command === "git" && args[0] === "--version") return "git version 2.45.0";
          if (command === "telnyx-edge" && args[0] === "--help") return "telnyx-edge v0.1.0";
          if (command === "telnyx-edge" && args[0] === "auth" && args[1] === "status") {
            return "Authentication Status: API Key\nStatus: authenticated";
          }
          throw new Error(`unexpected readiness command: ${command} ${args.join(" ")}`);
        },
      },
    });
    const service = new LinkAppPublisherService({
      storagePath: path.join(tempDir, "catalog.json"),
      deployer,
      enforceReviewers: true,
    });

    const readiness = service.readiness();
    assert.equal(readiness.ready, true);
    assert.equal(readiness.deployer.mode, "telnyx-edge");
    assert.ok(readiness.checks.every((check) => check.ok));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("LinkAppPublisherService can enforce reviewer squads for approvals", () => {
  const service = new LinkAppPublisherService({
    enforceReviewers: true,
    idGenerator: () => "reviewer",
    now: () => new Date("2026-06-09T12:00:00.000Z"),
  });
  service.createPublishIntent(publishInput("review-policy-app"));

  assert.throws(
    () => service.reviewApp("review-policy-app", { decision: "approve", reviewer: "unrelated@telnyx.com", reviewer_groups: ["other.squad"] }),
    /Reviewer is not allowed/,
  );

  const result = service.reviewApp("review-policy-app", {
    decision: "approve",
    reviewer: "reviewer@telnyx.com",
    reviewer_groups: ["messaging-ops.squad"],
  });
  assert.equal(result.app.status, "approved");
});

test("TelnyxEdgeCliDeployer clones source refs and runs telnyx-edge ship in the source subdir", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-edge-deployer-"));
  const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
  try {
    const deployer = new TelnyxEdgeCliDeployer({
      workspaceRoot: tempDir,
      edgeBinary: "telnyx-edge",
      gitBinary: "git",
      commandRunner: {
        run(command, args, options) {
          calls.push({ command, args, cwd: options.cwd });
          if (command === "git" && args[0] === "clone") {
            mkdirSync(path.join(String(args[2]), "apps", "edge-app"), { recursive: true });
            writeFileSync(path.join(String(args[2]), "apps", "edge-app", "package.json"), JSON.stringify({ scripts: { build: "vite build" } }));
            writeFileSync(path.join(String(args[2]), "apps", "edge-app", "package-lock.json"), "{}");
            return "cloned";
          }
          if (command === "git" && args[0] === "-C") return "checked out";
          if (command === "npm" && args[0] === "ci") return "installed TELNYX_API_KEY=supersecret";
          if (command === "npm" && args[0] === "run" && args[1] === "build") {
            mkdirSync(path.join(String(options.cwd), "dist"), { recursive: true });
            return "built";
          }
          if (command === "telnyx-edge") return "authorization: bearer live-token\ndeployed https://edge-app.apps.telnyx.io";
          throw new Error(`unexpected command: ${command}`);
        },
      },
    });
    const service = new LinkAppPublisherService({
      idGenerator: () => "edge",
      now: () => new Date("2026-06-09T12:00:00.000Z"),
      deployer,
    });

    const result = service.createPublishIntent({
      ...publishInput("edge-app"),
      source: { repo: "https://github.com/team-telnyx/mcp-apps", ref: "main", subdir: "apps/edge-app" },
    });

    assert.equal(result.deployment?.status, "succeeded");
    assert.equal(result.deployment?.url, "https://edge-app.apps.telnyx.io");
    assert.equal(result.app.previewUrl, "https://edge-app.apps.telnyx.io");
    assert.equal(result.version?.previewUrl, "https://edge-app.apps.telnyx.io");
    assert.match(result.deployment?.logs ?? "", /TELNYX_API_KEY=\[redacted\]/);
    assert.match(result.deployment?.logs ?? "", /authorization: bearer \[redacted\]/i);
    assert.doesNotMatch(result.deployment?.logs ?? "", /supersecret|live-token/);
    assert.deepEqual(calls.map((call) => `${call.command} ${call.args.join(" ")}`), [
      "git clone https://github.com/team-telnyx/mcp-apps " + calls[0].args[2],
      `git -C ${calls[0].args[2]} checkout main`,
      "npm ci",
      "npm run build",
      "telnyx-edge ship",
    ]);
    assert.equal(calls[2].cwd, path.join(calls[0].args[2], "apps", "edge-app"));
    assert.equal(calls[3].cwd, path.join(calls[0].args[2], "apps", "edge-app"));
    assert.equal(calls[4].cwd, path.join(calls[0].args[2], "apps", "edge-app"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TelnyxEdgeCliDeployer rejects deployment URLs outside approved internal VPN hostnames", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-edge-deployer-hosts-"));
  try {
    const deployer = new TelnyxEdgeCliDeployer({
      workspaceRoot: tempDir,
      edgeBinary: "telnyx-edge",
      gitBinary: "git",
      commandRunner: {
        run(command, args, options) {
          if (command === "git" && args[0] === "clone") {
            mkdirSync(path.join(String(args[2]), "apps", "edge-app"), { recursive: true });
            return "cloned";
          }
          if (command === "git" && args[0] === "-C") return "checked out";
          if (command === "npm" && args[0] === "run" && args[1] === "build") {
            mkdirSync(path.join(String(options.cwd), "dist"), { recursive: true });
            return "built";
          }
          if (command === "telnyx-edge") return "deployed https://edge-app.example.com";
          throw new Error(`unexpected command: ${command}`);
        },
      },
    });
    const service = new LinkAppPublisherService({
      idGenerator: () => "edge-host",
      now: () => new Date("2026-06-09T12:00:00.000Z"),
      deployer,
    });

    const result = service.createPublishIntent({
      ...publishInput("edge-host-app"),
      source: { repo: "https://github.com/team-telnyx/mcp-apps", ref: "main", subdir: "apps/edge-app" },
    });

    assert.equal(result.deployment?.status, "failed");
    assert.equal(result.app.status, "failed");
    assert.match(result.deployment?.message ?? "", /approved internal\/VPN hostnames/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TelnyxEdgeCliDeployer rejects shell-style build commands before shipping", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-edge-deployer-build-command-"));
  const calls: Array<{ command: string; args: string[] }> = [];
  try {
    const deployer = new TelnyxEdgeCliDeployer({
      workspaceRoot: tempDir,
      edgeBinary: "telnyx-edge",
      gitBinary: "git",
      commandRunner: {
        run(command, args) {
          calls.push({ command, args });
          if (command === "git" && args[0] === "clone") {
            mkdirSync(path.join(String(args[2]), "apps", "edge-app"), { recursive: true });
            return "cloned";
          }
          if (command === "git" && args[0] === "-C") return "checked out";
          throw new Error(`unexpected command: ${command}`);
        },
      },
    });
    const service = new LinkAppPublisherService({
      idGenerator: () => "edge-build",
      now: () => new Date("2026-06-09T12:00:00.000Z"),
      deployer,
    });

    const result = service.createPublishIntent({
      ...publishInput("edge-build-command-app"),
      source: { repo: "https://github.com/team-telnyx/mcp-apps", ref: "main", subdir: "apps/edge-app" },
      build: { command: "npm run build && rm -rf dist", output_dir: "dist" },
    });

    assert.equal(result.deployment?.status, "failed");
    assert.match(result.deployment?.message ?? "", /without shell operators/);
    assert.ok(calls.every((call) => call.command !== "telnyx-edge"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("LinkAppPublisherService rejects unsafe source repos and secret values", () => {
  const service = publisherService();

  assert.throws(
    () =>
      service.createPublishIntent({
        ...publishInput(),
        source: { repo: "https://github.com/personal/private-app" },
      }),
    /team-telnyx GitHub URL/,
  );

  assert.throws(
    () =>
      service.createPublishIntent({
        ...publishInput(),
        app: { ...publishInput().app, slug: "secret-test", env_schema: ["TELNYX_API_KEY=secret"] },
      }),
    /variable names only/,
  );
});

test("LinkAppPublisher HTTP API exposes publish, catalog, review, and duplicate endpoints", async () => {
  const service = publisherService();
  const server = createLinkAppPublisherServer(service, { requireAuth: false });
  const listener = await listenLinkAppPublisherServer(server);
  try {
    const publishResponse = await fetch(`${listener.url}/publish-intents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(publishInput("customer-signals-board")),
    });
    assert.equal(publishResponse.status, 202);
    const publishPayload = (await publishResponse.json()) as { app: { id: string; status: string } };
    assert.equal(publishPayload.app.id, "app-customer-signals-board");
    assert.equal(publishPayload.app.status, "preview");

    const catalogResponse = await fetch(`${listener.url}/apps`);
    assert.equal(catalogResponse.status, 200);
    const catalogPayload = (await catalogResponse.json()) as { apps: Array<{ slug: string }> };
    assert.deepEqual(catalogPayload.apps.map((app) => app.slug), ["customer-signals-board"]);

    const deploymentsResponse = await fetch(`${listener.url}/apps/customer-signals-board/deployments`);
    assert.equal(deploymentsResponse.status, 200);
    const deploymentsPayload = (await deploymentsResponse.json()) as { deployments: Array<{ id: string; target: string; status: string; logs?: string }> };
    assert.deepEqual(deploymentsPayload.deployments.map((deployment) => `${deployment.target}:${deployment.status}`), ["preview:succeeded"]);
    assert.match(deploymentsPayload.deployments[0].logs ?? "", /record-only mode/);

    const logsResponse = await fetch(`${listener.url}/apps/customer-signals-board/deployments/${deploymentsPayload.deployments[0].id}/logs`);
    assert.equal(logsResponse.status, 200);
    const logsPayload = (await logsResponse.json()) as { deployment: { id: string; status: string }; logs: string };
    assert.equal(logsPayload.deployment.id, deploymentsPayload.deployments[0].id);
    assert.equal(logsPayload.deployment.status, "succeeded");
    assert.match(logsPayload.logs, /record-only mode/);

    const versionsResponse = await fetch(`${listener.url}/apps/customer-signals-board/versions`);
    assert.equal(versionsResponse.status, 200);
    const versionsPayload = (await versionsResponse.json()) as { versions: Array<{ sourceRef: string }> };
    assert.deepEqual(versionsPayload.versions.map((version) => version.sourceRef), ["main"]);

    const reviewResponse = await fetch(`${listener.url}/apps/app-customer-signals-board/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(reviewResponse.status, 200);
    const reviewPayload = (await reviewResponse.json()) as { app: { status: string; vpnUrl: string } };
    assert.equal(reviewPayload.app.status, "approved");
    assert.equal(reviewPayload.app.vpnUrl, "https://customer-signals-board.apps.telnyx.io");

    const duplicateResponse = await fetch(`${listener.url}/apps/customer-signals-board/duplicate`, { method: "POST" });
    assert.equal(duplicateResponse.status, 200);
    const duplicatePayload = (await duplicateResponse.json()) as { source_repo: string; command: string; commands: string[]; path: string };
    assert.equal(duplicatePayload.source_repo, "https://github.com/team-telnyx/mcp-apps");
    assert.deepEqual(duplicatePayload.commands, [
      "git clone 'https://github.com/team-telnyx/mcp-apps' 'customer-signals-board'",
      "cd 'customer-signals-board'",
      "git checkout 'main'",
      "cd 'apps/carrier-readiness'",
    ]);
    assert.equal(duplicatePayload.command, duplicatePayload.commands.join(" && "));
    assert.equal(duplicatePayload.path, "customer-signals-board/apps/carrier-readiness");

    const ownershipResponse = await fetch(`${listener.url}/apps/customer-signals-board/ownership`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner_squad: "signals-platform.squad", reviewers: ["signals-platform.squad"] }),
    });
    assert.equal(ownershipResponse.status, 200);
    const ownershipPayload = (await ownershipResponse.json()) as { app: { ownerSquad: string; reviewers: string[] } };
    assert.equal(ownershipPayload.app.ownerSquad, "signals-platform.squad");
    assert.deepEqual(ownershipPayload.app.reviewers, ["signals-platform.squad"]);

    const deprecateResponse = await fetch(`${listener.url}/apps/customer-signals-board/deprecations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "Superseded." }),
    });
    assert.equal(deprecateResponse.status, 200);
    const deprecatePayload = (await deprecateResponse.json()) as { app: { status: string } };
    assert.equal(deprecatePayload.app.status, "deprecated");
  } finally {
    await listener.close();
  }
});

test("LinkAppPublisher HTTP API requires auth by default", async () => {
  const server = createLinkAppPublisherServer(publisherService());
  const listener = await listenLinkAppPublisherServer(server);
  try {
    const response = await fetch(`${listener.url}/apps`);
    assert.equal(response.status, 401);
  } finally {
    await listener.close();
  }
});

test("LinkAppPublisher HTTP API exposes production readiness", async () => {
  const defaultServer = createLinkAppPublisherServer(new LinkAppPublisherService());
  const defaultListener = await listenLinkAppPublisherServer(defaultServer);
  try {
    const response = await fetch(`${defaultListener.url}/readyz`);
    assert.equal(response.status, 503);
    const payload = (await response.json()) as { ready: boolean; deployer: { mode: string } };
    assert.equal(payload.ready, false);
    assert.equal(payload.deployer.mode, "record-only");
    const metricsResponse = await fetch(`${defaultListener.url}/metrics`);
    assert.equal(metricsResponse.status, 200);
    assert.match(metricsResponse.headers.get("content-type") ?? "", /text\/plain/);
    const metrics = await metricsResponse.text();
    assert.match(metrics, /link_app_publisher_up 1/);
    assert.match(metrics, /link_app_publisher_http_requests_total \d+/);
  } finally {
    await defaultListener.close();
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-app-publisher-ready-http-"));
  try {
    const service = new LinkAppPublisherService({
      storagePath: path.join(tempDir, "catalog.json"),
      enforceReviewers: true,
      deployer: new TelnyxEdgeCliDeployer({
        workspaceRoot: tempDir,
        commandRunner: {
          run(command, args) {
            if (command === "git" && args[0] === "--version") return "git version 2.45.0";
            if (command === "telnyx-edge" && args[0] === "--help") return "telnyx-edge v0.1.0";
            if (command === "telnyx-edge" && args[0] === "auth" && args[1] === "status") return "Authentication Status: API Key";
            throw new Error(`unexpected readiness command: ${command} ${args.join(" ")}`);
          },
        },
      }),
    });
    const missingContextServer = createLinkAppPublisherServer(service, { requireAuth: true });
    const missingContextListener = await listenLinkAppPublisherServer(missingContextServer);
    try {
      const response = await fetch(`${missingContextListener.url}/readyz`);
      assert.equal(response.status, 503);
      const payload = (await response.json()) as { checks: Array<{ name: string; ok: boolean }> };
      assert.ok(payload.checks.some((check) => check.name === "Authenticated actor context enforced" && !check.ok));
    } finally {
      await missingContextListener.close();
    }

    const server = createLinkAppPublisherServer(service, { requireAuth: true, requireAuthContext: true });
    const listener = await listenLinkAppPublisherServer(server);
    try {
      const response = await fetch(`${listener.url}/readyz`);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as { ready: boolean; checks: Array<{ ok: boolean }> };
      assert.equal(payload.ready, true);
      assert.ok(payload.checks.every((check) => check.ok));
    } finally {
      await listener.close();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("LinkAppPublisher HTTP API can require authenticated actor context", async () => {
  const server = createLinkAppPublisherServer(publisherService(), { requireAuth: true, requireAuthContext: true });
  const listener = await listenLinkAppPublisherServer(server);
  try {
    const missingContextResponse = await fetch(`${listener.url}/publish-intents`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(publishInput("missing-auth-context")),
    });
    assert.equal(missingContextResponse.status, 401);
    assert.match(await missingContextResponse.text(), /actor or group context/);

    const acceptedResponse = await fetch(`${listener.url}/publish-intents`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
        "x-telnyx-actor": "publisher@telnyx.com",
      },
      body: JSON.stringify(publishInput("with-auth-context")),
    });
    assert.equal(acceptedResponse.status, 202);
  } finally {
    await listener.close();
  }
});

test("LinkAppPublisher HTTP API can enforce reviewer context from headers", async () => {
  const service = new LinkAppPublisherService({
    enforceReviewers: true,
    idGenerator: () => "http-reviewer",
    now: () => new Date("2026-06-09T12:00:00.000Z"),
  });
  const server = createLinkAppPublisherServer(service, { requireAuth: true });
  const listener = await listenLinkAppPublisherServer(server);
  try {
    const authHeaders = {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    };
    const publishResponse = await fetch(`${listener.url}/publish-intents`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(publishInput("http-review-policy-app")),
    });
    assert.equal(publishResponse.status, 202);

    const rejectedReview = await fetch(`${listener.url}/apps/http-review-policy-app/reviews`, {
      method: "POST",
      headers: { ...authHeaders, "x-telnyx-actor": "unrelated@telnyx.com", "x-telnyx-groups": "other.squad" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(rejectedReview.status, 403);

    const approvedReview = await fetch(`${listener.url}/apps/http-review-policy-app/reviews`, {
      method: "POST",
      headers: { ...authHeaders, "x-telnyx-actor": "reviewer@telnyx.com", "x-telnyx-groups": "link-platform.squad" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(approvedReview.status, 200);
    const payload = (await approvedReview.json()) as { app: { status: string } };
    assert.equal(payload.app.status, "approved");
  } finally {
    await listener.close();
  }
});
