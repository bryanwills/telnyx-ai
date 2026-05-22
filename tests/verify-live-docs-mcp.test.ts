import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkDiscoveryDocument,
  checkInitializeResponse,
  checkJsonRpcErrorEnvelope,
  checkToolsListResponse,
  parseJsonOrSse
} from "../scripts/verify-live-docs-mcp.ts";

describe("verify-live-docs-mcp helpers", () => {
  it("detects missing initialize instructions from an SSE payload", () => {
    const payload = parseJsonOrSse([
      "event: message",
      'data: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","serverInfo":{"name":"Telnyx","version":"1.0.0"},"capabilities":{"tools":{"listChanged":true}}}}'
    ].join("\n"));

    const checks = checkInitializeResponse(payload);
    assert.equal(checks.find((check) => check.name === "initialize instructions")?.ok, false);
  });

  it("detects missing tool annotations", () => {
    const message = {
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: [
          { name: "search_telnyx", description: "Search docs" },
          { name: "query_docs_filesystem_telnyx", description: "Read docs" }
        ]
      }
    };

    const check = checkToolsListResponse(message);
    assert.equal(check.ok, false);
    assert.match(check.details, /search_telnyx/);
  });

  it("detects result.isError fallbacks that are not JSON-RPC error envelopes", () => {
    const message = {
      jsonrpc: "2.0",
      id: 3,
      result: {
        isError: true,
        content: [{ type: "text", text: "MCP error -32602: Tool not found" }]
      }
    };

    const check = checkJsonRpcErrorEnvelope(message);
    assert.equal(check.ok, false);
    assert.match(check.details, /result\.isError/);
  });

  it("flags a discovery document that jumps to another origin", () => {
    const checks = checkDiscoveryDocument(
      {
        version: "1.0.0",
        transport: "http",
        url: "https://telnyx.main-kill-isr.mintlify.me/mcp"
      },
      "https://developers.telnyx.com"
    );

    assert.equal(checks.find((check) => check.name === "well-known same-origin url")?.ok, false);
  });
});
