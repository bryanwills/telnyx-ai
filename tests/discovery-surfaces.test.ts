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

const README = read("README.md");
const AGENTS = read("AGENTS.md");
const agentJson = JSON.parse(read("agent.json"));

const canonicalDiscovery = {
  start_url: "https://telnyx.com/agents/start",
  agent_manifest_url: "https://telnyx.com/.well-known/agent-card.json",
  agent_access_url: "https://telnyx.com/.well-known/agent-access.json",
  agent_skills_index_url: "https://telnyx.com/.well-known/agent-skills/index.json",
  mcp_server_card_url: "https://telnyx.com/.well-known/mcp/server-card.json",
  mcp_url: "https://api.telnyx.com/v2/mcp",
  openapi_url: "https://telnyx.com/.well-known/openapi.json",
  capabilities_url: "https://telnyx.com/ai/capabilities.json",
  pricing_url: "https://telnyx.com/ai/pricing.json",
  webhooks_guide: "/guides/webhooks.md",
} as const;

describe("agent discovery surfaces", () => {
  it("agent.json exposes the canonical discovery map", () => {
    assert.deepEqual(agentJson.discovery, canonicalDiscovery);
  });

  it("agent.json auth matches the discovery access surface", () => {
    assert.equal(agentJson.auth.signup_manifest, canonicalDiscovery.agent_access_url);
    assert.equal(agentJson.auth.signup_guide, "https://telnyx.com/agent-signup.md");
  });

  it("agent.json links keep critical discovery URLs aligned", () => {
    assert.equal(agentJson.links.agents_start, canonicalDiscovery.start_url);
    assert.equal(agentJson.links.agent_manifest, canonicalDiscovery.agent_manifest_url);
    assert.equal(agentJson.links.agent_access, canonicalDiscovery.agent_access_url);
    assert.equal(agentJson.links.agent_skills_index, canonicalDiscovery.agent_skills_index_url);
    assert.equal(agentJson.links.openapi, canonicalDiscovery.openapi_url);
    assert.equal(agentJson.links.mcp_server_card, canonicalDiscovery.mcp_server_card_url);
    assert.equal(agentJson.links.mcp, canonicalDiscovery.mcp_url);
    assert.equal(agentJson.links.capabilities, canonicalDiscovery.capabilities_url);
    assert.equal(agentJson.links.pricing, canonicalDiscovery.pricing_url);
    assert.equal(agentJson.links.webhooks_guide, canonicalDiscovery.webhooks_guide);
  });

  it("README.md surfaces every canonical discovery URL", () => {
    for (const value of Object.values(canonicalDiscovery)) {
      assert.match(README, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("AGENTS.md surfaces every canonical discovery URL", () => {
    for (const value of Object.values(canonicalDiscovery)) {
      assert.match(AGENTS, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("README.md explicitly names auth, OpenAPI, MCP, pricing, and webhooks in the discovery section", () => {
    for (const term of ["Auth guide", "OpenAPI spec", "MCP server card", "Pricing", "Webhooks guide"]) {
      assert.match(README, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});
