import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkAuthMd,
  checkJsonDocument,
  checkWebhookDiscoverability,
  checkWebhookGuideUrl,
  checkWwwAuthenticate
} from "../scripts/verify-live-agent-discovery.ts";

describe("verify-live-agent-discovery helpers", () => {
  it("fails when auth.md omits a required discovery URL", () => {
    const probe = checkAuthMd("https://api.telnyx.com/v2/mcp", 200);
    assert.equal(probe.ok, false);
    assert.match(probe.details, /agent-access/);
  });

  it("checks a JSON discovery document with a predicate", () => {
    const probe = checkJsonDocument(
      "MCP discovery",
      "GET",
      "https://telnyx.com/.well-known/mcp",
      200,
      { servers: [{ endpoint: "https://api.telnyx.com/v2/mcp" }] },
      (body) => Array.isArray(body.servers),
      "ok",
      "bad"
    );
    assert.equal(probe.ok, true);
  });

  it("fails when the MCP bearer challenge omits the resource metadata hint", () => {
    const probe = checkWwwAuthenticate(401, null);
    assert.equal(probe.ok, false);
    assert.match(probe.details, /missing/);
  });

  it("fails when llms.txt omits the explicit Telnyx webhooks link", () => {
    const probe = checkWebhookDiscoverability(200, "Primary agent entrypoint: https://telnyx.com/agents/start");
    assert.equal(probe.ok, false);
    assert.match(probe.details, /Telnyx webhooks/);
  });

  it("checks that the live webhook guide resolves", () => {
    const probe = checkWebhookGuideUrl(200, "https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks");
    assert.equal(probe.ok, true);
  });
});
