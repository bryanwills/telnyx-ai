# Telnyx Link

Telnyx Link is an AI companion for Telnyx employees. It is intended to help employees navigate customers, systems, products, incidents, internal knowledge, and workflows through a permission-aware AI operating layer.

This package contains the local runtime, CLI, skill loader, OKF validation, and managed-service contracts used by Link Desktop. The bundled local tool runtime is intentionally deterministic and mocked; real integrations should be added behind explicit permission, audit, and test boundaries.

The product direction is inspired by Ramp's Glass as an internal AI coworker pattern. See [Glass-Inspired Product Reference](docs/glass-reference.md) for the design and systems principles to carry forward without copying third-party branding or assets.

## Current Scope

- Root `Telnyx Link` agent definition
- Specialist agent stubs and routing boundaries
- Optional OpenAI Agents SDK graph for future live orchestration
- Deterministic local tool gateway with safety metadata
- Markdown skill loader with frontmatter validation
- OKF bundle validation for Archive imports
- Shared customer Slack draft workflow
- Approval decision model
- Managed Link App Publisher API contract
- Managed Link Skill Registry API contract for stars, installs/downloads, and runs
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
npm exec -- telnyx-link app-publisher 4300 --storage ./publisher-catalog.json --dev-no-auth
npm exec -- telnyx-link skill-registry 4310 --storage ./skill-registry.json --dev-no-auth
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
     -> deterministic local tool gateway
     -> policy and approval model
     -> audit logger
     -> memory placeholders
```

The OpenAI Agents SDK adapter is in `src/agents/openai-sdk.ts`. The deterministic local runtime does not require an OpenAI API key. Live SDK mode should only be used after explicit authorization and environment setup.

## Link App Publisher

`src/app-publisher.ts` contains the managed publisher API contract used by Link Desktop:

- `POST /publish-intents`
- `POST /apps/{id}/versions`
- `GET /apps`
- `GET /apps/{id}`
- `GET /apps/{id}/deployments`
- `GET /apps/{id}/deployments/{deploymentId}/logs`
- `GET /apps/{id}/versions`
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`
- `POST /apps/{id}/duplicate`
- `POST /apps/{id}/reviews`
- `POST /apps/{id}/rollback`
- `POST /apps/{id}/ownership`
- `POST /apps/{id}/deprecations`

The service accepts only VPN-access apps, requires an internal auth header by default, stores source refs instead of local files, rejects non-`team-telnyx` source repos, persists catalog state when `--storage` or `LINK_APP_PUBLISHER_STORAGE` is set, records preview/production deployment status, exposes sanitized deployment logs, keeps version history for rollback, supports ownership transfer/deprecation, and never returns local `.env` or secret values in duplicate responses. Duplicate handoffs return structured clone/checkout/subdir commands pinned to the reviewed source ref.

Local app submissions use `link-app.yml` as the desktop-side contract. Link Desktop parses the manifest, fills source repo/ref/subdir from Git when omitted, and posts the normalized publisher payload. The flat manifest shape is:

```yaml
name: Carrier Readiness Hub
slug: carrier-readiness-hub
owner_squad: messaging-ops.squad
audience: Messaging, NOC
app_type: web
install_command: npm ci
build_command: npm run build
output_dir: dist
env_schema:
  - TELNYX_API_KEY
access: vpn
reviewers:
  - messaging-ops.squad
risk_level: medium
```

The same local-app path is scriptable for smoke tests:

```bash
# Verify manifest and Git-derived source ref without submitting.
npm exec -- telnyx-link publish-local-app ./apps/carrier-readiness --dry-run

# Submit to a local or VPN publisher.
npm exec -- telnyx-link publish-local-app ./apps/carrier-readiness \
  --publisher-url=http://127.0.0.1:4300 \
  --token="$TELNYX_AUTH_REV2"

# Exercise the full local-app publisher flow:
# inspect manifest, publish preview, approve, list deployments/logs, and duplicate source handoff.
npm exec -- telnyx-link publisher-e2e-smoke ./apps/carrier-readiness \
  --publisher-url=http://127.0.0.1:4300 \
  --reviewer-groups=messaging-ops.squad \
  --token="$TELNYX_AUTH_REV2"

# Add --check-app-url to verify the approved VPN app URL is reachable.
npm exec -- telnyx-link publisher-e2e-smoke ./apps/carrier-readiness \
  --publisher-url=https://link-app-publisher.query.prod.telnyx.io \
  --reviewer-groups=messaging-ops.squad \
  --token="$TELNYX_AUTH_REV2" \
  --require-ready \
  --require-pushed-ref \
  --check-app-url
```

By default, local runs use a record-only deployer. For a production-like Edge handoff, run the same service with:

```bash
LINK_APP_PUBLISHER_DEPLOYER=telnyx-edge npm exec -- telnyx-link app-publisher 4300 --storage ./publisher-catalog.json
```

or pass `--edge-deployer`. That deployer clones the approved `team-telnyx` source ref into a temporary workspace, checks out the requested ref, runs an allowlisted `install_command` or infers one from lockfiles, runs the allowlisted `build_command` in `source_subdir`, verifies `output_dir` exists when declared, then runs `telnyx-edge ship`. It captures deployment URL/log output and records deployment status without adding Edge lifecycle ownership to Link. URLs returned by `telnyx-edge ship` must resolve under approved private Telnyx Edge hostnames such as `*.apps.telnyx.io` or `*.query.prod.telnyx.io`; unexpected public hosts fail the deployment record.

Production runs can also pass `--enforce-reviewers` or set `LINK_APP_PUBLISHER_ENFORCE_REVIEWERS=1`. In that mode, review requests must include an actor or group header matching the app's `reviewers` list or `owner_squad`; Link Desktop forwards `X-Telnyx-Actor`, `X-On-Behalf-Of`, and `X-Telnyx-Groups` when those values are configured.

For production, also pass `--require-auth-context` or set `LINK_APP_PUBLISHER_REQUIRE_AUTH_CONTEXT=1`. This requires publisher API requests to include both auth and Telnyx actor/group context from the VPN/Okta boundary, so reviewer enforcement cannot run against anonymous bearer-token calls.

For production e2e, the publisher should start with persistent storage, reviewer enforcement, and the Edge deployer:

```bash
LINK_APP_PUBLISHER_STORAGE=/var/lib/link-app-publisher/catalog.json \
LINK_APP_PUBLISHER_DEPLOYER=telnyx-edge \
LINK_APP_PUBLISHER_ENFORCE_REVIEWERS=1 \
LINK_APP_PUBLISHER_REQUIRE_AUTH_CONTEXT=1 \
npm exec -- telnyx-link app-publisher 4300

curl -fsS http://127.0.0.1:4300/readyz
```

`/readyz` returns `200` only when storage is configured, reviewer policy is enforced, publisher auth and actor/group context are required, Git is available, `telnyx-edge` is available, and `telnyx-edge auth status` reports an authenticated state. Record-only local mode intentionally returns `503` so it cannot be mistaken for a production-ready publisher. `/metrics` returns Prometheus text metrics including process uptime and HTTP request totals for service scraping.

The test suite includes a production-like `publisher-e2e-smoke` path with a fake `telnyx-edge` binary and a temporary Git URL rewrite. That verifies the service can clone a reviewed `team-telnyx` source ref, run install/build, run `telnyx-edge ship`, sanitize logs, approve the app, and return duplicate/fork commands without needing real Edge credentials. A real production smoke still requires the dedicated `telnyx-edge` CLI from `team-telnyx/edge-compute` and `telnyx-edge auth api-key set <your-api-key>` or equivalent authenticated state.

## Link Skill Registry

`src/skill-registry.ts` contains the managed skill tracking API used by Link Desktop:

- `GET /skills?ids=link:account-briefing,telnyx:sms`
- `GET /skills/{id}`
- `POST /skills/{id}/events`
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

Events use `event_type` values of `star`, `unstar`, `install`, `run`, or `view`. V1 treats `install` as the download metric. Stars and installs are unique per authenticated actor, while runs and views are counters. The service stores hashed actor keys, persists registry state when `--storage` or `LINK_SKILL_REGISTRY_STORAGE` is set, requires an internal auth header by default, and exposes Prometheus text metrics at `/metrics`.

Run it locally:

```bash
npm exec -- telnyx-link skill-registry 4310 \
  --storage ./skill-registry.json \
  --dev-no-auth
```

Production should run it as a private Edge-hosted internal service with persistent storage and actor context enforced:

```bash
LINK_SKILL_REGISTRY_STORAGE=/var/lib/link-skill-registry/registry.json \
LINK_SKILL_REGISTRY_REQUIRE_AUTH_CONTEXT=1 \
npm exec -- telnyx-link skill-registry 4310

curl -fsS http://127.0.0.1:4310/readyz
```

Link Desktop does not bundle a hosted registry URL. Set `LINK_SKILL_REGISTRY_URL` to an approved HTTPS or loopback deployment when a managed registry is available. If the registry is unconfigured or unavailable, Desktop caches local stats and queues events for a later retry.

## Link Message Gateway

`src/message-gateway.ts` contains the managed delivery harness used by Link Desktop:

- `POST /messages`
- `GET /messages`
- `GET /messages/{id}`
- `GET /messages/{id}/events`
- `POST /webhooks/slack/events`
- `POST /webhooks/google-chat/events`
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

The gateway stores a compact delivery ledger, not a canonical chat inbox. Message bodies are retained only for the delivery/retry window and can be redacted after retention. Recipients are canonical addresses such as `person@telnyx.com`, `agent:aida`, or `group:messaging-ops`; human recipients must resolve to active `@telnyx.com` directory entries. Routing uses an explicit `X-Link-Transport` hint first, then recipient preference, then Slack for mapped humans, Google Chat fallback, and A2A for agents.

Run it locally:

```bash
npm exec -- telnyx-link message-gateway 4320 \
  --storage ./message-gateway-ledger.json \
  --dev-no-auth
```

Production should run it as a private hosted service with persistent storage, provider secrets, webhook ingress, and actor context enforced:

```bash
LINK_MESSAGE_GATEWAY_STORAGE=/var/lib/link-message-gateway/ledger.json \
LINK_MESSAGE_GATEWAY_REQUIRE_AUTH_CONTEXT=1 \
npm exec -- telnyx-link message-gateway 4320

curl -fsS http://127.0.0.1:4320/readyz
```

Link Desktop does not bundle a hosted message gateway URL. Set `LINK_MESSAGE_GATEWAY_URL` to an approved HTTPS or loopback deployment when managed delivery is available. If the hosted gateway is unconfigured or unavailable, Desktop shows a local record-only ledger fallback so development can verify envelope creation without pretending a provider-authored send occurred.

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

Add deterministic local tools in `src/tools.ts`. Every tool must declare:

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

## Deterministic Local Tools

The bundled local tools return deterministic fixtures for Slack, Salesforce, Google Workspace, Guru, Linear/Jira, GitHub, Datadog, Snowflake, Telnyx account lookup, messaging logs, voice/SIP traces, network/carrier status, and billing/revenue lookup. Treat them as test fixtures, not live integrations.

## Memory Placeholder

Memory is intentionally disabled. Future memory should include daily synthesis, cleanup pipelines, source attribution, permission-aware recall, user controls, retention policy, and strict customer data boundaries.

## OKF Bundle Validation

`tools/link` includes an Open Knowledge Format v0.1 parser for Link Archive imports. It treats OKF as an interchange format, not a replacement for permission-aware memory. Concept files must be Markdown with YAML frontmatter and a non-empty `type` field; unknown fields are preserved, and broken internal links are reported as warnings so partially generated bundles remain inspectable.

## Next Milestones

1. Reviewed read-only integrations for the highest-value internal sources
2. Draft-only internal channel bot backed by the shared-channel approval model
3. Safe account briefing using reviewed internal read-only tools
4. Production-managed Skill Registry and Message Gateway deployments
5. Permission-aware memory with source attribution and retention controls
6. Scheduled workflows with explicit approval and audit trails
7. Shared customer channel beta
8. Windows packaged app
9. External customer-facing Link assistant
