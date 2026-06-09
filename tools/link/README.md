# Telnyx Link

Telnyx Link is an AI companion for Telnyx employees. It is intended to help employees navigate customers, systems, products, incidents, internal knowledge, and workflows through a permission-aware AI operating layer.

This MVP is intentionally safe and mocked. It does not call Slack, Salesforce, Google Workspace, Snowflake, Datadog, GitHub, Telnyx production APIs, or any other production system.

The product direction is inspired by Ramp's Glass as an internal AI coworker pattern. See [Glass-Inspired Product Reference](docs/glass-reference.md) for the design and systems principles to carry forward without copying third-party branding or assets.

## MVP Scope

- Root `Telnyx Link` agent definition
- Specialist agent stubs and routing boundaries
- Optional OpenAI Agents SDK graph for future live orchestration
- Mocked tool gateway with safety metadata
- Markdown skill loader with frontmatter validation
- Shared customer Slack draft workflow
- Approval decision model
- Managed Link App Publisher API contract
- In-memory audit logger
- Memory service placeholders
- CLI surfaces for chat, skills, and shared-channel draft mode

## Run Locally

```bash
cd tools/link
npm ci
npm run link:dev -- "brief me on Acme Messaging"
npm run link:skill -- "SMS Delivery Investigation"
npm run link:shared-channel
npm exec -- telnyx-link app-publisher 4300 --dev-no-auth
```

Verification:

```bash
npm run typecheck
npm test
```

## Architecture

```text
Telnyx Link surfaces
  -> LinkRuntime
     -> root Telnyx Link agent
     -> specialist agent registry
     -> markdown skills loader
     -> mocked tool gateway
     -> policy and approval model
     -> audit logger
     -> memory placeholders
```

The OpenAI Agents SDK adapter is in `src/agents/openai-sdk.ts`. The mocked local runtime does not require an OpenAI API key. Live SDK mode should only be used after explicit authorization and environment setup.

## Link App Publisher

`src/app-publisher.ts` contains the managed publisher API contract used by Link Desktop:

- `POST /publish-intents`
- `POST /apps/{id}/versions`
- `GET /apps`
- `GET /apps/{id}`
- `POST /apps/{id}/duplicate`
- `POST /apps/{id}/reviews`

The service accepts only VPN-access apps, requires an internal auth header by default, stores source refs instead of local files, rejects non-`team-telnyx` source repos, and never returns local `.env` or secret values in duplicate responses. Production deployment should place this service behind the company VPN and replace the in-memory store/build simulation with durable storage plus Edge Compute deploy jobs.

## Add a Skill

Add a markdown file under `tools/link/skills`.

Required frontmatter:

```yaml
---
name: Account Briefing
description: Create a concise account briefing from internal context.
owner: GTM
team: Sales
risk_level: medium
tools_required:
  - salesforce.account_lookup
  - slack.search
customer_safe: false
approval_required: false
---
```

Skill bodies should include when to use it, inputs needed, workflow steps, expected output format, and safety notes.

## Add a Tool

Add mocked tools in `src/tools.ts`. Every tool must declare:

- name
- description
- category
- visibility
- capability
- risk level
- approval requirement
- whether output can be shown externally

Real implementations should live in separate modules later and must go through the same registry, audit, approval, and permission checks.

## Shared-Channel Safety

In `shared_customer` mode, Link returns:

- Customer-safe draft
- Internal rationale
- Sources used
- Approval status

Customer-facing drafts redact internal links, raw diagnostics, private records, and internal Slack channels. External posting is always approval-required.

## What Is Mocked

All current tool outputs are deterministic mocks for Slack, Salesforce, Google Workspace, Guru, Linear/Jira, GitHub, Datadog, Snowflake, Telnyx account lookup, messaging logs, voice/SIP traces, network/carrier status, and billing/revenue lookup.

## Memory Placeholder

Memory is intentionally disabled. Future memory should include daily synthesis, cleanup pipelines, source attribution, permission-aware recall, user controls, retention policy, and strict customer data boundaries.

## Next Milestones

1. MVP skeleton with mocked tools and skills
2. Real Slack internal bot in draft-only mode
3. Real account briefing using safe internal read-only tools
4. Mac desktop shell with SSO
5. Skill marketplace / Armory
6. Permission-aware memory
7. Scheduled workflows
8. Shared customer channel beta
9. Windows app
10. External customer-facing Link assistant
