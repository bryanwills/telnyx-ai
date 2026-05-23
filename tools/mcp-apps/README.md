# Telnyx MCP Apps

Telnyx MCP Apps are app-layer MCP servers with focused tools and MCP Apps UI resources for specific Telnyx workflows. This directory keeps local/reference app source in the `team-telnyx/ai` monorepo.

Deployment and image builds live in [`team-telnyx/mcp-apps`](https://github.com/team-telnyx/mcp-apps).

These apps are separate from [`tools/mcp`](../mcp), which is the generic `@telnyx/mcp` stdio proxy to the hosted Telnyx API MCP endpoint at `https://api.telnyx.com/v2/mcp`.

## Apps

- [`apps/number-intelligence`](apps/number-intelligence) — phone-number analysis using Telnyx Number Lookup and read-first readiness signals.
- [`apps/usage-cost-explorer`](apps/usage-cost-explorer) — balance, usage reports, billing groups, and guarded billing controls.
- [`apps/voice-monitor`](apps/voice-monitor) — read-only active-call monitoring, call timelines, call status, and recording discovery.

## Repository layout

```text
tools/mcp-apps/
  apps/
    number-intelligence/
    usage-cost-explorer/
    voice-monitor/
  package.json
  tsconfig.json
```

The root package is an npm workspace package with `apps/*` workspaces. Each app is a private package with its own source, tests, and README.

## Setup

From `tools/mcp-apps`:

```sh
npm install
```

Each app reads `TELNYX_API_KEY` from the environment when making live Telnyx API calls. Local `.env` files are supported by the app servers and `.env.example` files are included in each app directory.

## Checks

From `tools/mcp-apps`:

```sh
npm run typecheck
npm run build
npm test
```

Run an individual app with npm workspaces, for example:

```sh
npm run dev --workspace @telnyx-mcp-apps/number-intelligence
npm run dev --workspace @telnyx-mcp-apps/usage-cost-explorer
npm run dev --workspace @telnyx-mcp-apps/voice-monitor
```

## MCP Apps surface

Each app exposes a stdio MCP server using `@modelcontextprotocol/sdk` and registers MCP Apps metadata/UI resources using `@modelcontextprotocol/ext-apps`. See the app READMEs for tool names, environment variables, and safety behavior.

## When to use MCP Apps vs other Telnyx surfaces

Choose the narrowest surface that matches the agent's trust boundary:

- Use a focused MCP App when the workflow should stay governed, least-privilege, and aligned to a single operational contract.
- Use [`tools/mcp`](../mcp) when an expert client truly needs the broad generic Telnyx MCP proxy.
- Use the raw SDK/toolkit packages when you own the agent's mutation policy, approval flow, and idempotency behavior in-process.

For external-agent builders, the intended default is: discover an app at `/apps/:slug`, bind only the listed tools, and follow that app's contract rather than recreating raw Telnyx endpoint behavior in prompts.

## Governed contract for external agents

The MCP Apps in this repo are meant to be consumed as policy-bearing tool surfaces, not just transport wrappers.

- Read-first tools can run directly and should be the default troubleshooting path.
- Preview-first or confirmation-gated tools must keep their confirmation token or explicit `confirm=true` requirement intact. Do not compress preview and mutation into one synthetic step.
- Use least-privilege API keys for the chosen app. A diagnostic app should not run with a write-everything credential.
- When a governed surface accepts an idempotency field or confirmation token, keep that value stable across retries and log it in your orchestration layer.
- If the app does not expose the mutation you want, stop at the governed boundary and hand off to a broader reviewed surface instead of inventing a second behavior model.

The hosted HTTP wrapper also exposes public discovery surfaces for deploys:

- `GET /apps` — public app catalog
- `GET /apps/:slug` — per-app discovery document with bearer-auth contract, absolute MCP URL, tool names, and `ui://` resource URIs
- `GET /.well-known/mcp-app-registry.json` — machine-readable MCP Apps registry for scanners and server cards
- `GET /.well-known/mcp-apps.json` — alias of the registry endpoint above

On the hosted MCP endpoint itself, `tools/list` returns the app tool annotations and `_meta.ui.resourceUri` values, and `resources/list` returns the corresponding `ui://` app resources. That is the public runtime proof path for ORA-style scanners and clients.

For the public docs-facing deployment, the expected hosted proof path is:

- `https://developers.telnyx.com/.well-known/mcp-app-registry.json`
- `https://developers.telnyx.com/.well-known/mcp-apps.json`
- `https://developers.telnyx.com/apps/number-intelligence`
- `https://developers.telnyx.com/apps/number-intelligence/mcp`

From the repo root, run `npm run verify:live-docs-mcp-apps` to check that the hosted docs wrapper publishes the registry, the per-app discovery document, and the runtime `tools/list` / `resources/list` surface for the proof app.
