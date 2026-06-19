# CLAUDE.md — team-telnyx/ai

Project rules for Claude Code (and other Claude-family coding agents)
working in this repo. The canonical source of truth is `AGENTS.md` at
the repo root — keep this file in sync with it.

## What this repo is

Telnyx AI — agent toolkits (Python, TypeScript), agent CLI, plugins for
Claude Code / Cursor / Gemini CLI / OpenCode, an MCP proxy, 235+ Agent
Skills, and operational guides.

## Hard rules (must follow)

- **Generated files** under `providers/claude/plugin/skills/` and
  `providers/cursor/plugin/skills/` are produced by
  `./scripts/sync-skills.sh` from `skills/`. **Never hand-edit them.**
  Edit the source under `skills/` and run the sync script.
- **Per-package installs**: each package owns its own `package.json` /
  `node_modules`. Don't run `npm install` at the repo root and don't
  introduce a root-level test runner.
- **No secrets in commits**: never add `.env` files, API keys, or
  credentials. Use the existing `.env.example` patterns.
- **Conventional Commits**: title prefix required (`feat:`, `fix:`,
  `chore:`, `docs:`).
- **Signed commits**: maintainer setup expects verified signatures.

## Setup

Per-package, not root:

```bash
cd cli && npm ci
cd apps/link-desktop && npm ci
cd tools/typescript && npm ci
cd tools/link && npm ci
cd tools/mcp && npm ci
cd tools/python && pip install -e ".[dev]"
```

Root-level: `npm ci` covers only the guides test scripts.

## Testing

Run only the package you touched.

| Package | Command |
| --- | --- |
| `cli/` | `cd cli && npm test` |
| `apps/link-desktop/` | `cd apps/link-desktop && npm run typecheck && npm test && npm run build` |
| `tools/python/` | `cd tools/python && pytest` |
| `tools/typescript/` | `cd tools/typescript && npm test` |
| `tools/link/` | `cd tools/link && npm run typecheck && npm test` |
| `tools/mcp/` | `cd tools/mcp && npm run build` |
| `guides/` | `npm run test:guides` (root) |
| Guides API | `npm run test:guides-api` (root) |

## Local Electron testing

For Telnyx Cloud Link Desktop on macOS, prefer the root launch script:

```bash
./script/build_and_run.sh --verify
./script/build_and_run.sh
```

That script stops the previous local Cloud Link process, builds `tools/link`, builds `apps/link-desktop`, prepares the branded development app bundle, and opens `Telnyx Cloud Link.app`. Use `./script/build_and_run.sh --logs` for a unified Electron log stream. Do not leave multiple Electron instances running during QA.

For Windows or Linux, run the package dev launcher:

```bash
cd apps/link-desktop
npm ci
npm run dev
```

For a Windows bundled-renderer smoke test, use PowerShell:

```powershell
cd apps/link-desktop
npm --prefix ../../tools/link run build
npm run build
$env:LINK_DESKTOP_RENDERER="dist/renderer/index.html"
.\node_modules\.bin\electron.cmd .\src\main\main.js
```

On Linux, use the same build sequence and launch with `LINK_DESKTOP_RENDERER=dist/renderer/index.html ./node_modules/.bin/electron src/main/main.js`.

## Editing agent skills

Skills are written as `SKILL.md` files under `skills/<skill-name>/`.
After editing any skill, run:

```bash
./scripts/sync-skills.sh
```

Commit the sync output alongside the skill change — don't leave them
out of sync. CI will catch drift.

## Code style

- TypeScript: ES2020+, strict mode, ESM where supported.
- Python: 3.10+, PEP 8, type hints on public functions.
- Markdown: GitHub-flavored, ATX headings only.
- One concern per PR — skill regen + skill source go together; toolkit
  refactors stay separate.

## Where things live

- `skills/` — canonical SKILL.md files (the source of truth)
- `providers/{claude,cursor}/` — generated plugin packaging (don't edit)
- `plugins/opencode/` — OpenCode plugin (auth + TUI for Telnyx-hosted models)
- `apps/link-desktop/` — Electron desktop shell for Telnyx Cloud Link
- `tools/python/` — Python agent toolkit (PyPI)
- `tools/typescript/` — TypeScript agent toolkit (npm)
- `tools/link/` — Cloud Link local runtime and managed-service contracts
- `tools/mcp/` — MCP proxy server
- `tools/ffl-cli/` — Filling-from-life CLI
- `cli/` — agent CLI for provisioning Telnyx infrastructure
- `inference/` — Telnyx inference docs
- `guides/` — operational guides
- `agent.json` — top-level agent manifest
- `.claude-plugin/` — Claude Code marketplace metadata
- `.cursor-plugin/` — Cursor marketplace metadata
- `gemini-extension.json` — Gemini CLI extension manifest

For runtime-agent (consumer) guidance, see `AGENTS.md` §"Consuming this
repo as a runtime agent".
