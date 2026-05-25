import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const read = (path: string) => readFileSync(join(ROOT, path), "utf-8");
const readJson = (path: string) => JSON.parse(read(path));

const authMd = read("auth.md");
const agentJson = readJson("agent.json");
const mcpIndex = readJson(".well-known/mcp.json");
const serverCard = readJson(".well-known/mcp/server-card.json");
const authServer = readJson(".well-known/oauth-authorization-server");
const protectedResource = readJson(".well-known/oauth-protected-resource");
const mcpProtectedResource = readJson(".well-known/oauth-protected-resource-v2-mcp.json");

describe("auth discovery artifacts", () => {
  it("auth.md points agents at the repo's public auth surfaces", () => {
    for (const url of [
      "https://telnyx.com/.well-known/agent-access.json",
      "https://telnyx.com/agent-signup.md",
      "https://api.telnyx.com/.well-known/oauth-authorization-server",
      "https://api.telnyx.com/.well-known/oauth-protected-resource",
      "https://api.telnyx.com/.well-known/oauth-protected-resource/v2/mcp",
      "https://api.telnyx.com/v2/mcp"
    ]) {
      assert.match(authMd, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("MCP discovery points at the canonical endpoint and server card", () => {
    assert.equal(mcpIndex.servers[0].endpoint, agentJson.discovery.mcp_url);
    assert.equal(mcpIndex.servers[0].card, agentJson.discovery.mcp_server_card_url);
    assert.equal(serverCard.serverUrl, agentJson.discovery.mcp_url);
    assert.equal(serverCard.links.auth_md, agentJson.discovery.auth_md_url);
  });

  it("protected-resource metadata and auth-server metadata are internally consistent", () => {
    assert.deepEqual(protectedResource.authorization_servers, [authServer.issuer]);
    assert.deepEqual(mcpProtectedResource.authorization_servers, [authServer.issuer]);
    assert.equal(protectedResource.resource, "https://api.telnyx.com");
    assert.equal(mcpProtectedResource.resource, agentJson.discovery.mcp_url);
    assert.match(serverCard.instructions, /Authorization: Bearer <TELNYX_API_KEY>/);
  });

  it("auth-server metadata exposes the current agent onboarding pointers", () => {
    assert.equal(authServer.agent_onboarding.documentation_uri, agentJson.discovery.auth_md_url);
    assert.equal(authServer.agent_onboarding.agent_access_uri, agentJson.discovery.agent_access_url);
    assert.equal(authServer.agent_onboarding.signup_guide_uri, agentJson.auth.signup_guide);
    assert.deepEqual(authServer.protected_resources, [
      "https://api.telnyx.com",
      "https://api.telnyx.com/v2/mcp"
    ]);
  });
});
