import test from "node:test";
import assert from "node:assert/strict";
import { rootAgent, specialistAgents, routePromptToSpecialist } from "../src/agents/definitions.js";
import { InMemoryAuditLogger } from "../src/audit.js";
import { LinkRuntime } from "../src/runtime.js";
import { createDefaultToolRegistry, metadataForTool, mockedTools } from "../src/tools.js";

test("root agent is configured for Telnyx Link with specialist handoffs", () => {
  assert.equal(rootAgent.name, "Telnyx Link");
  assert.match(rootAgent.instructions, /trusted AI companion/);
  assert.match(rootAgent.instructions, /Hindsight is Link's source-attributed long-term memory layer/);
  assert.equal(rootAgent.handoffs.length, 8);
  assert.ok(rootAgent.handoffs.includes("Link Shared Channel Agent"));
});

test("specialist agents declare boundaries and safety metadata", () => {
  for (const agent of specialistAgents) {
    assert.ok(agent.name);
    assert.ok(agent.purpose);
    assert.ok(agent.instructions);
    assert.match(agent.instructions, /Hindsight is Link's source-attributed long-term memory layer/);
    assert.ok(agent.allowedToolCategories.length > 0);
    assert.ok(["low", "medium", "high"].includes(agent.riskLevel));
    assert.ok(agent.customerSafeRules.length > 0);
  }
});

test("routes prompts to appropriate specialist agents", () => {
  assert.equal(routePromptToSpecialist("Investigate SMS delivery for Acme").name, "Customer Support Investigation Agent");
  assert.equal(routePromptToSpecialist("Draft customer-safe Slack Connect update").name, "Link Shared Channel Agent");
  assert.equal(routePromptToSpecialist("Prepare competitive battlecard").name, "Sales Assistant Agent");
});

test("mocked tools expose required safety metadata", async () => {
  const registry = createDefaultToolRegistry();

  assert.equal(registry.list().length, mockedTools.length);
  for (const tool of registry.list()) {
    const metadata = metadataForTool(tool);
    assert.ok(metadata.name.includes("."));
    assert.ok(metadata.description);
    assert.ok(metadata.category);
    assert.ok(["internal_only", "customer_safe"].includes(metadata.visibility));
    assert.ok(["read", "write", "read_write"].includes(metadata.capability));
    assert.ok(["low", "medium", "high"].includes(metadata.riskLevel));
    assert.equal(typeof metadata.approvalRequired, "boolean");
    assert.equal(typeof metadata.outputCanBeShownExternally, "boolean");
  }

  const result = await registry.invoke("salesforce.account_lookup", { accountId: "acct_mock_001" });
  assert.equal((result.output as { accountName: string }).accountName, "Acme Messaging Co.");
});

test("LinkRuntime chat logs routing in mocked mode", async () => {
  const auditLogger = new InMemoryAuditLogger();
  const runtime = new LinkRuntime({ auditLogger });
  const result = await runtime.chat({ prompt: "Need help with network carrier outage", actorId: "tester" });

  assert.equal(result.agent, "Telnyx Link");
  assert.equal(result.routedTo, "Network Operations Agent");
  assert.ok(auditLogger.all().some((event) => event.eventType === "agent.routed"));
});
