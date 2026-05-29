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
const AGENTS_START = read("agents/start.md");
const LLMS = read("llms.txt");
const agentJson = JSON.parse(read("agent.json"));

const canonicalDiscovery = {
  start_url: "https://telnyx.com/agents/start",
  agent_manifest_url: "https://telnyx.com/.well-known/agent-card.json",
  agent_access_url: "https://telnyx.com/.well-known/agent-access.json",
  agent_skills_index_url: "https://telnyx.com/.well-known/agent-skills/index.json",
  agents_md_url: "https://telnyx.com/AGENTS.md",
  auth_md_url: "https://telnyx.com/auth.md",
  llms_txt_url: "https://telnyx.com/llms.txt",
  oauth_authorization_server_url: "https://api.telnyx.com/.well-known/oauth-authorization-server",
  oauth_protected_resource_url: "https://api.telnyx.com/.well-known/oauth-protected-resource",
  mcp_resource_metadata_url: "https://api.telnyx.com/.well-known/oauth-protected-resource/v2/mcp",
  mcp_server_card_url: "https://telnyx.com/.well-known/mcp/server-card.json",
  mcp_url: "https://api.telnyx.com/v2/mcp",
  mcp_apps_registry_url: "https://developers.telnyx.com/.well-known/mcp-app-registry.json",
  mcp_apps_alias_url: "https://developers.telnyx.com/.well-known/mcp-apps.json",
  mcp_apps_catalog_url: "https://developers.telnyx.com/apps",
  mcp_apps_proof_app_url: "https://developers.telnyx.com/apps/number-intelligence",
  openapi_url: "https://telnyx.com/.well-known/openapi.json",
  capabilities_url: "https://telnyx.com/ai/capabilities.json",
  pricing_url: "https://telnyx.com/ai/pricing.json",
  webhooks_guide: "https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks",
} as const;

describe("agent discovery surfaces", () => {
  it("agent.json publishes a governed-execution legend", () => {
    assert.deepEqual(agentJson.governed_execution.fields, [
      "risk_class",
      "approval_expectation",
      "memory_scope",
      "model_behavior"
    ]);
    assert.deepEqual(Object.keys(agentJson.governed_execution.risk_classes), [
      "read_only",
      "guarded_write",
      "live_write"
    ]);
  });

  it("every agent capability exposes governed-execution metadata", () => {
    for (const capability of agentJson.capabilities) {
      assert.ok(capability.governance, `${capability.id} missing governance`);
      assert.match(capability.governance.risk_class, /^(read_only|guarded_write|live_write)$/);
      assert.match(capability.governance.approval_expectation, /^(none|confirm_before_mutation|confirm_before_external_effect)$/);
      assert.match(capability.governance.memory_scope, /^(stateless|host_controlled|customer_configured|app_scoped)$/);
      assert.match(capability.governance.model_behavior, /^(host_controlled|request_selected|customer_configured|app_defined)$/);
    }
  });

  it("agent.json exposes the canonical discovery map", () => {
    assert.deepEqual(agentJson.discovery, canonicalDiscovery);
  });

  it("agent.json auth matches the discovery access surface", () => {
    assert.equal(agentJson.auth.signup_manifest, canonicalDiscovery.agent_access_url);
    assert.equal(agentJson.auth.signup_guide, "https://telnyx.com/agent-signup.md");
    assert.equal(agentJson.auth.auth_md, canonicalDiscovery.auth_md_url);
    assert.equal(agentJson.auth.oauth_authorization_server, canonicalDiscovery.oauth_authorization_server_url);
    assert.equal(agentJson.auth.oauth_protected_resource, canonicalDiscovery.oauth_protected_resource_url);
    assert.equal(agentJson.auth.mcp_resource_metadata, canonicalDiscovery.mcp_resource_metadata_url);
  });

  it("agent.json links keep critical discovery URLs aligned", () => {
    assert.equal(agentJson.links.agents_start, canonicalDiscovery.start_url);
    assert.equal(agentJson.links.agent_manifest, canonicalDiscovery.agent_manifest_url);
    assert.equal(agentJson.links.agent_access, canonicalDiscovery.agent_access_url);
    assert.equal(agentJson.links.agent_skills_index, canonicalDiscovery.agent_skills_index_url);
    assert.equal(agentJson.links.agents_md, canonicalDiscovery.agents_md_url);
    assert.equal(agentJson.links.auth_md, canonicalDiscovery.auth_md_url);
    assert.equal(agentJson.links.llms_txt, canonicalDiscovery.llms_txt_url);
    assert.equal(agentJson.links.oauth_authorization_server, canonicalDiscovery.oauth_authorization_server_url);
    assert.equal(agentJson.links.oauth_protected_resource, canonicalDiscovery.oauth_protected_resource_url);
    assert.equal(agentJson.links.mcp_resource_metadata, canonicalDiscovery.mcp_resource_metadata_url);
    assert.equal(agentJson.links.openapi, canonicalDiscovery.openapi_url);
    assert.equal(agentJson.links.mcp_server_card, canonicalDiscovery.mcp_server_card_url);
    assert.equal(agentJson.links.mcp, canonicalDiscovery.mcp_url);
    assert.equal(agentJson.links.mcp_apps_registry, canonicalDiscovery.mcp_apps_registry_url);
    assert.equal(agentJson.links.mcp_apps_alias, canonicalDiscovery.mcp_apps_alias_url);
    assert.equal(agentJson.links.mcp_apps_catalog, canonicalDiscovery.mcp_apps_catalog_url);
    assert.equal(agentJson.links.mcp_apps_proof_app, canonicalDiscovery.mcp_apps_proof_app_url);
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

  it("agents/start.md links the core public discovery surfaces and names webhooks explicitly", () => {
    for (const value of [
      ...Object.values(canonicalDiscovery),
      "/agent.json",
      "/guides/webhooks.md",
      "/guides/ai-assistants.md",
      "/guides/voice-agent-onboarding.md",
      "/tools/python/examples"
    ]) {
      assert.match(AGENTS_START, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    for (const term of [
      "Telnyx webhooks guide",
      "signature verification",
      "What agents can do with Telnyx",
      "Frequently asked questions",
      "Governed execution metadata",
      "risk_class",
      "approval_expectation",
      "memory_scope",
      "model_behavior",
      "read_only",
      "guarded_write",
      "live_write",
      "application/ld+json",
      "\"@type\": \"Article\"",
      "\"@type\": \"FAQPage\"",
      "governed examples",
      "openai/gpt-5.4"
    ]) {
      assert.match(AGENTS_START, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("llms.txt mirrors the entrypoint and keeps webhook discovery visible", () => {
    for (const value of [
      canonicalDiscovery.start_url,
      canonicalDiscovery.agent_manifest_url,
      canonicalDiscovery.agent_access_url,
      canonicalDiscovery.auth_md_url,
      canonicalDiscovery.llms_txt_url,
      canonicalDiscovery.openapi_url,
      canonicalDiscovery.mcp_url,
      canonicalDiscovery.webhooks_guide,
      canonicalDiscovery.agents_md_url,
      "https://telnyx.com/guides/ai-assistants.md",
      "https://telnyx.com/guides/voice-agent-onboarding.md",
      "https://github.com/team-telnyx/ai/tree/main/tools/python/examples"
    ]) {
      assert.match(LLMS, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    for (const term of [
      "Summary",
      "What an agent should learn first",
      "How to choose a surface",
      "Governed examples",
      "without JavaScript",
      "openai/gpt-5.4"
    ]) {
      assert.match(LLMS, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("README.md explicitly names auth, MCP Apps, OpenAPI, MCP, pricing, and webhooks in the discovery section", () => {
    for (const term of ["Auth guide", "OAuth authorization server", "OAuth protected resource", "MCP resource metadata", "MCP Apps registry", "MCP Apps catalog", "OpenAPI spec", "MCP server card", "Pricing", "Telnyx webhooks guide"]) {
      assert.match(README, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("agent.json names MCP Apps as a first-class discoverable capability", () => {
    const capability = agentJson.capabilities.find((entry: { id: string }) => entry.id === "mcp_apps");
    assert.ok(capability);
    assert.equal(capability.docs, canonicalDiscovery.mcp_apps_catalog_url);
    assert.match(capability.api, /mcp-app-registry\.json/);
  });
});
