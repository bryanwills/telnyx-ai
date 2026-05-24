import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkAppDiscoveryDocument,
  checkRegistryDocument,
  checkResourcesListRuntime,
  checkToolsListRuntime,
  verifyLiveDocsMcpApps
} from "../scripts/verify-live-docs-mcp-apps.ts";

describe("verify-live-docs-mcp-apps helpers", () => {
  it("flags a registry document that omits the proof app", () => {
    const checks = checkRegistryDocument(
      {
        kind: "mcp-app-registry",
        registry_url: "https://developers.telnyx.com/.well-known/mcp-app-registry.json",
        alternate_registry_url: "https://developers.telnyx.com/.well-known/mcp-apps.json",
        auth: { type: "bearer", header: "Authorization", prefix: "Bearer" },
        apps: [{ slug: "voice-monitor" }]
      },
      "https://developers.telnyx.com",
      "number-intelligence"
    );

    assert.equal(checks.find((check) => check.name === "registry includes proof app")?.ok, false);
  });

  it("flags app discovery documents that point off-origin", () => {
    const checks = checkAppDiscoveryDocument(
      {
        app: {
          slug: "number-intelligence",
          discovery_url: "https://developers.telnyx.com/apps/number-intelligence",
          mcp_url: "https://api.telnyx.com/v2/mcp",
          tool_names: ["number_intelligence_analyze"],
          resource_uris: ["ui://number-intelligence/index.html"],
          auth: { type: "bearer" }
        }
      },
      "https://developers.telnyx.com",
      "number-intelligence"
    );

    assert.equal(checks.find((check) => check.name === "app discovery exact public URLs")?.ok, false);
  });

  it("detects missing ui metadata in tools/list", () => {
    const checks = checkToolsListRuntime(
      {
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "number_intelligence_analyze",
              annotations: { readOnlyHint: true }
            }
          ]
        }
      },
      "ui://number-intelligence/index.html"
    );

    assert.equal(checks.find((check) => check.name === "runtime tools/list ui metadata")?.ok, false);
  });

  it("detects missing ui resources in resources/list", () => {
    const check = checkResourcesListRuntime(
      {
        jsonrpc: "2.0",
        id: 3,
        result: {
          resources: []
        }
      },
      "ui://number-intelligence/index.html"
    );

    assert.equal(check.ok, false);
  });

  it("truncates large live-doc fetch failures to readable evidence", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("<html>" + "x".repeat(400) + "</html>", {
        status: 404,
        headers: { "Content-Type": "text/html" }
      });

    try {
      const report = await verifyLiveDocsMcpApps("https://developers.telnyx.com", "number-intelligence");
      const failure = report.checks.find((check) => check.name === "public registry endpoint");
      assert.equal(failure?.ok, false);
      assert.match(failure?.details ?? "", /returned 404:/);
      assert.ok((failure?.details?.length ?? 0) < 340, failure?.details);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
