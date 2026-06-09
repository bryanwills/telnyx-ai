import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAuditLogger } from "../src/audit.js";
import { createLinkAppPublisherServer, LinkAppPublisherService, listenLinkAppPublisherServer } from "../src/app-publisher.js";

function publisherService() {
  let nextId = 0;
  return new LinkAppPublisherService({
    idGenerator: () => `test-${++nextId}`,
    now: () => new Date("2026-06-09T12:00:00.000Z"),
  });
}

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
  assert.equal(result.app.previewUrl, "https://carrier-readiness-hub.link-apps-preview.query.prod.telnyx.io");
  assert.deepEqual(result.review?.reviewers, ["messaging-ops.squad", "link-platform.squad"]);
  assert.ok(auditLogger.all().some((event) => event.eventType === "link_app.publish_intent.created"));
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

  const reviewResult = service.reviewApp("app-release-desk", {
    decision: "approve",
    reviewer: "link-platform.squad",
    notes: "Approved for private VPN access.",
  });
  assert.equal(reviewResult.app.status, "approved");
  assert.equal(reviewResult.app.vpnUrl, "https://release-desk.apps.telnyx.io");
  assert.equal(reviewResult.version?.reviewedAt, "2026-06-09T12:00:00.000Z");

  const duplicate = service.duplicateApp("release-desk");
  assert.equal(duplicate.action, "source_ref");
  assert.equal(duplicate.source_ref, "release-preview");
  assert.equal(duplicate.source_subdir, "apps/release-desk");
  assert.doesNotMatch(JSON.stringify(duplicate), /\.env|TELNYX_API_KEY=/);
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
    const duplicatePayload = (await duplicateResponse.json()) as { source_repo: string; command: string };
    assert.equal(duplicatePayload.source_repo, "https://github.com/team-telnyx/mcp-apps");
    assert.equal(duplicatePayload.command, "git clone https://github.com/team-telnyx/mcp-apps");
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
