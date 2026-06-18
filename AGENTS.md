# AGENTS.md

Operating instructions for AI coding agents working **on** this repo, and for runtime agents **consuming** it.

This file is a complement to `README.md` (human-facing) and `.github/CONTRIBUTING.md` (contribution flow). When in doubt, prefer the commands here.

---

## What this repo is

The one-stop shop for AI agents and AI-first developers building with Telnyx. It contains agent toolkits (Python/TypeScript), an agent CLI, a unified plugin for Claude Code / Cursor / Gemini CLI / OpenCode, an MCP proxy, 235+ Agent Skills, and operational guides.

---

## Working on this repo

### Setup

This is an npm-based monorepo, but the workspaces are independent — install per-package, not at the root.

```bash
# Root tooling (only for `npm run test:guides*`)
npm ci

# Per-package
cd cli && npm ci
cd apps/link-desktop && npm ci
cd tools/typescript && npm ci
cd tools/link && npm ci
cd tools/link-skill-registry && npm ci
cd tools/mcp && npm ci
cd tools/mcp-apps && npm ci
cd tools/python && pip install -e ".[dev]"
```

### Test / build / lint

| Package          | Command                            |
| ---------------- | ---------------------------------- |
| `cli/`           | `cd cli && npm test`               |
| `apps/link-desktop/` | `cd apps/link-desktop && npm run typecheck && npm test && npm run build` |
| `tools/python/`  | `cd tools/python && pytest`        |
| `tools/typescript/` | `cd tools/typescript && npm test` |
| `tools/link/`    | `cd tools/link && npm run typecheck && npm test` |
| `tools/link-skill-registry/` | `cd tools/link-skill-registry && npm run build` |
| `tools/mcp/`     | `cd tools/mcp && npm run build`    |
| `tools/mcp-apps/`| `cd tools/mcp-apps && npm run typecheck && npm run build && npm test` |
| `guides/`        | `npm run test:guides` (from root)  |
| Guides API tests | `npm run test:guides-api` (root)   |

Run the relevant package's test suite before declaring a task done. Don't run all of them — pick the one you touched.

For the Telnyx Link desktop shell, use `./script/build_and_run.sh` from the repo root as the default kill/build/run entrypoint. Use `./script/build_and_run.sh --verify` for a launch smoke test. Do not open additional Electron instances for handoff or QA; replace the existing Link process with this script, or quit the active app before launching another one.

### Where things live

| Path                    | What it contains                                                          |
| ----------------------- | ------------------------------------------------------------------------- |
| `apps/link-desktop/`    | Electron desktop shell for Telnyx Link.                                   |
| `skills/`               | Canonical agent skills (SKILL.md files). 235+ skills covering messaging, voice, numbers, AI, IoT, WebRTC, Twilio migration. |
| `providers/claude/`     | Claude Code plugin packaging — synced from `skills/` via `scripts/sync-skills.sh`. Don't edit by hand. |
| `providers/cursor/`     | Cursor plugin packaging — synced from `skills/` via `scripts/sync-skills.sh`. Don't edit by hand. |
| `plugins/opencode/`     | OpenCode plugin (auth + TUI for Telnyx-hosted models).                    |
| `tools/python/`         | Python agent toolkit (PyPI: `telnyx-agent-toolkit`).                      |
| `tools/typescript/`     | TypeScript agent toolkit (npm).                                           |
| `tools/link/`           | Telnyx Link local runtime and managed-service contracts for skills, apps, approvals, and shared-channel safety. |
| `tools/link-skill-registry/` | Private Link Skill Registry Edge service for skill stars, installs/downloads, and run counts. |
| `tools/mcp/`            | MCP proxy server for the generic Telnyx API MCP endpoint.                |
| `tools/mcp-apps/`       | Focused app-layer MCP servers with MCP Apps UI resources.                |
| `tools/ffl-cli/`        | Filling-from-life CLI tooling.                                            |
| `cli/`                  | Agent CLI for provisioning Telnyx infrastructure.                         |
| `inference/`            | Documentation for Telnyx-hosted inference.                                |
| `guides/`               | Step-by-step operational guides.                                          |
| `scripts/sync-skills.sh`| Syncs `skills/` → `providers/{claude,cursor}/plugin/skills/`.             |
| `agent.json`            | Top-level agent manifest (capabilities, auth, endpoints).                 |
| `.claude-plugin/`       | Claude Code marketplace metadata.                                         |
| `.cursor-plugin/`       | Cursor marketplace metadata.                                              |
| `gemini-extension.json` | Gemini CLI extension manifest.                                            |

### Editing skills

`skills/` is the canonical source. After editing any skill, run:

```bash
./scripts/sync-skills.sh
```

This propagates changes to `providers/claude/` and `providers/cursor/`. Commit the sync output alongside your skill edits — don't leave them out of sync.

### Editing `agent.json`

The capability list in `agent.json` is the source of truth for what Telnyx surfaces to runtime agents. When adding a capability, also add the corresponding skill under `skills/` and the guide under `guides/` referenced by the `guide` field.

### Code style

- TypeScript: ES2020+, strict mode, ESM where the package supports it.
- Python: 3.10+, PEP 8, type hints required for public functions.
- Markdown: GitHub-flavored. Use ATX headings (`#`, not underlines).
- One change per PR — don't bundle skill edits with toolkit refactors.

### Link desktop UI guardrails

- For `apps/link-desktop` middle-section tables, reuse the shared `chatSessionRows` / `chatResultRow` / `directoryResultRow` scaffold instead of inventing a new table primitive.
- Keep header and body columns on the same grid math. If a table body uses `scrollbar-gutter: stable`, the matching header needs the extra right-side gutter compensation so header tracks resolve to the same width as body rows.
- Do not override shared table cells back to content-width blocks. App tables regressed before because `.appDirectoryResultRow > span` stopped stretching to the grid track, which pulled header and body columns out of alignment.
- If a table intentionally opts out of scrollable rowgroups, add a local header padding override that matches that non-scrollable variant instead of changing the shared table rhythm globally.
- Before shipping table changes, verify at least one populated table in the rendered UI, not just source or screenshots of empty states.

### Commit and PR conventions

- Conventional Commits prefix in the title (`feat:`, `fix:`, `chore:`, `docs:`).
- Sign commits (the maintainers' setup expects verified signatures).
- One concern per PR. Keep skill regenerations (`scripts/sync-skills.sh`) in the same PR as the skill source change.
- Reference the issue number in the PR description if one exists.

### Don'ts

- Don't edit files under `providers/claude/plugin/skills/` or `providers/cursor/plugin/skills/` directly — they are generated. Edit the source under `skills/` and run `./scripts/sync-skills.sh`.
- Don't introduce a root-level test runner — each package has its own.
- Don't commit credentials, API keys, or `.env` files. Use the patterns in existing `.env.example` files.
- Don't `npm install` at the root and expect it to install workspace deps — each package has its own `package.json` and `node_modules/`.
- Don't add new top-level directories without updating this file and `README.md`'s table of contents.

---

## Consuming this repo as a runtime agent

If you are an AI agent **using** Telnyx (not modifying this repo), the entry points are:

| You want to…                                              | Start here                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Discover Telnyx capabilities                              | `/agent.json` (this repo) or `https://telnyx.com/agents/start`          |
| Generate Telnyx code with a coding assistant              | Install the plugin: `team-telnyx/ai` marketplace (Claude / Cursor / Gemini / OpenCode) — see `README.md` |
| Use Telnyx APIs from an agent framework (OpenAI Agents SDK, LangChain, CrewAI, Vercel AI SDK) | `tools/python/` or `tools/typescript/`                                   |
| Talk to Telnyx via MCP                                    | `https://api.telnyx.com/v2/mcp` (Bearer auth) — proxy in `tools/mcp/`   |
| Provision Telnyx infrastructure programmatically          | `cli/` — `npm install -g @telnyx/cli`                                   |
| Get an API key as an agent                                | `https://telnyx.com/agent-signup.md` (PoW-based programmatic signup)   |

### Auth (for runtime consumers)

- **API keys**: Bearer token, `Authorization: Bearer <key>`. Get one via the portal or programmatically via `https://telnyx.com/agent-signup.md`.
- **OAuth**: Metadata at `https://telnyx.com/.well-known/oauth-authorization-server`.
- **MCP**: Bearer auth against `https://api.telnyx.com/v2/mcp`. Card at `https://telnyx.com/.well-known/mcp/server-card.json`.

See `agent.json` (`auth` block) for the canonical auth contract.

### Discovery surfaces

| Surface                                          | URL                                                       |
| ------------------------------------------------ | --------------------------------------------------------- |
| Agent fast path (entry point)                    | `https://telnyx.com/agents/start`                         |
| Agent manifest                                   | `https://telnyx.com/.well-known/agent-card.json`          |
| Agent access (signup contract)                   | `https://telnyx.com/.well-known/agent-access.json`        |
| Agent skills index                               | `https://telnyx.com/.well-known/agent-skills/index.json`  |
| MCP server card                                  | `https://telnyx.com/.well-known/mcp/server-card.json`     |
| OpenAPI spec                                     | `https://telnyx.com/.well-known/openapi.json`             |
| llms.txt                                         | `https://telnyx.com/llms.txt`                             |
| Capability index                                 | `https://telnyx.com/ai/capabilities.json`                 |
| Pricing                                          | `https://telnyx.com/ai/pricing.json`                      |

---

## Reporting issues

- **Bugs / feature requests**: open an issue.
- **Security issues**: see `.github/SECURITY.md` — do not file public issues for vulnerabilities.

---

_Last reviewed: 2026-05-07_
