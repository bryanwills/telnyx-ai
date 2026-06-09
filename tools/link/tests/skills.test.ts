import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { InMemoryAuditLogger } from "../src/audit.js";
import { parseFrontmatter, normalizeSkillMetadata } from "../src/skills/frontmatter.js";
import { discoverSkills, runSkill } from "../src/skills/loader.js";
import { createDefaultToolRegistry } from "../src/tools.js";

test("discovers starter skills and parses frontmatter", async () => {
  const skills = await discoverSkills();
  const skillFiles = (await readdir("skills")).filter((file) => file.endsWith(".md"));
  const names = skills.map((skill) => skill.metadata.name);

  assert.equal(skills.length, skillFiles.length);
  assert.ok(names.includes("Account Briefing"));
  assert.ok(names.includes("Make HTML Slides"));
  assert.ok(names.includes("Shared Slack Channel Response Draft"));

  const accountBriefing = skills.find((skill) => skill.metadata.name === "Account Briefing");
  assert.equal(accountBriefing?.metadata.riskLevel, "medium");
  assert.deepEqual(accountBriefing?.metadata.toolsRequired.slice(0, 2), [
    "salesforce.account_lookup",
    "slack.search",
  ]);

  const htmlSlides = skills.find((skill) => skill.metadata.name === "Make HTML Slides");
  assert.equal(htmlSlides?.metadata.team, "All");
  assert.equal(htmlSlides?.metadata.riskLevel, "low");
  assert.deepEqual(htmlSlides?.metadata.toolsRequired, []);
});

test("frontmatter parser handles lists and booleans", () => {
  const parsed = parseFrontmatter(`---
name: Demo
description: Demo skill
owner: Team
team: Ops
risk_level: low
tools_required:
  - slack.search
customer_safe: true
approval_required: false
---
## Workflow steps
- Do the thing
`);

  const metadata = normalizeSkillMetadata(parsed.metadata);
  assert.equal(metadata.name, "Demo");
  assert.deepEqual(metadata.toolsRequired, ["slack.search"]);
  assert.equal(metadata.customerSafe, true);
});

test("invalid skill metadata fails loudly", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "link-skill-invalid-"));
  try {
    await writeFile(
      path.join(dir, "invalid.md"),
      `---
name: Invalid
description: Missing owner
team: Ops
risk_level: unknown
tools_required:
  - slack.search
customer_safe: false
approval_required: false
---
## Workflow steps
- No-op
`,
    );

    await assert.rejects(() => discoverSkills(dir), /missing required metadata: owner/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runs a skill with mocked tools and audit events", async () => {
  const auditLogger = new InMemoryAuditLogger(() => new Date("2026-06-04T10:00:00.000Z"));
  const result = await runSkill(
    "SMS Delivery Investigation",
    { accountId: "acct_mock_001", query: "delivery delay" },
    { toolRegistry: createDefaultToolRegistry(), auditLogger, actorId: "tester" },
  );

  assert.equal(result.skill.name, "SMS Delivery Investigation");
  assert.ok(result.toolResults.length >= 3);
  assert.ok(result.execution.workflowSteps.length > 0);

  const eventTypes = auditLogger.all().map((event) => event.eventType);
  assert.ok(eventTypes.includes("tool.invoked"));
  assert.ok(eventTypes.includes("skill.used"));
});
