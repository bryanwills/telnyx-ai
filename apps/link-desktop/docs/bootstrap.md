# Telnyx Link Desktop Bootstrap

Use this page when you need a fast, repeatable way to build, launch, and verify the Telnyx Link desktop shell from a fresh checkout.

## Quick bootstrap

From the repository root:

```bash
cd /path/to/ai
npm --prefix tools/link ci
npm --prefix apps/link-desktop ci
./script/build_and_run.sh --verify
```

For an interactive local launch:

```bash
./script/build_and_run.sh
```

The script is the default desktop entrypoint. It stops any existing Electron process for this app, loads `apps/link-desktop/.env.local` if present, builds `tools/link`, builds the desktop renderer, then starts Electron against the bundled renderer. Use it instead of launching another Electron copy when a local Link app is already open.

## What `build_and_run.sh` does

`script/build_and_run.sh` keeps the local app in the same shape that packaged builds expect:

- Builds `tools/link` before the desktop app so the local `@telnyx/link` file dependency is current.
- Builds `apps/link-desktop` with Vite so Electron loads `dist/renderer/index.html`.
- Sets `LINK_DESKTOP_RENDERER=dist/renderer/index.html` for the Electron main process.
- Uses Node.js from common local managers first, then falls back to the Codex runtime path when available.
- Stops the previous Electron process before launching a new one, matching both the Electron binary path and the Link main script path.
- The app enforces a single running instance; a second launch focuses the existing window instead of opening another copy.
- Supports `--verify`, `--logs`, and `--debug` for smoke tests, unified log streaming, and LLDB sessions.

## Credential and service gates

Link is live-ready, not live-by-default. Hosted services are contacted only when their credentials, URLs, or Okta session are configured. Missing integrations should fall back to deterministic local data or fail closed.

Use Settings for normal setup. The Settings page stores saved secrets through Electron `safeStorage` and does not return saved secret values to the renderer.

Use `apps/link-desktop/.env.local` only for developer overrides. The bootstrap script and `npm run dev` load it automatically. Environment variables take precedence over saved Settings credentials.

Common gates:

| Area | Configure | Expected behavior when missing |
| ---- | --------- | ------------------------------ |
| Agent Control Plane | `AUTH_INTERNAL_URL`, `AGENT_CONTROL_PLANE_URL`, Okta Rev2 token | Local mocked agents and readiness messaging |
| Link App Publisher | `LINK_APP_PUBLISHER_URL`, auth context, reviewer policy | Local/default catalog, managed mutations disabled unless fallback is explicitly enabled |
| Skill Registry | `LINK_SKILL_REGISTRY_URL` | Local skill loading and queued events |
| Google Workspace | Settings Google connection or Google env overrides | Connection card remains disconnected |
| GitHub pairing | Settings GitHub connection or developer token fallback | Pairing card remains disconnected |
| Telnyx APIs | Saved Telnyx API key or `TELNYX_API_KEY` | Live Telnyx actions stay unavailable |
| Local terminal | `LINK_DESKTOP_ENABLE_TERMINAL=1` | Built-in terminal remains hidden in packaged builds |

Do not put Okta passwords, API keys, or customer data in committed files.

## Verification

For desktop package changes, run the focused desktop checks:

```bash
cd apps/link-desktop
npm run typecheck
npm test
npm run build
```

For a launch smoke test from the repo root:

```bash
./script/build_and_run.sh --verify
```

For browser-only UI QA:

```bash
cd apps/link-desktop
npm run preview
```

For phone dialer behavior:

```bash
cd apps/link-desktop
npm run test:e2e:phone
```

For App Publisher behavior:

```bash
cd apps/link-desktop
npm run test:e2e:publisher
```

For Telnyx Whisper native helper work:

```bash
cd apps/link-desktop
npm run whisper:test
npm run whisper:build
```

## Working on Link

Start with these files:

| Path | Purpose |
| ---- | ------- |
| `apps/link-desktop/src/main/main.js` | Electron main process, IPC handlers, credential storage, service adapters |
| `apps/link-desktop/src/main/preload.cjs` | Trusted preload bridge exposed to the renderer |
| `apps/link-desktop/src/renderer/App.tsx` | Main React shell and screens |
| `apps/link-desktop/src/renderer/styles.css` | Desktop UI tokens and layout styles |
| `apps/link-desktop/src/renderer/api.ts` | Renderer-side API wrapper around the preload bridge |
| `tools/link/src/` | Shared Link runtime contracts, app publisher, skill registry, approvals, memory, message gateway |
| `tools/link/docs/glass-reference.md` | Product direction reference for Link UX decisions |
| `apps/link-desktop/tests/` | Desktop unit and integration tests |
| `apps/link-desktop/tests/e2e/` | Browser and Electron E2E checks |

Keep changes scoped to the package or shared runtime you touch. If you edit a shared contract in `tools/link`, run that package's focused tests too.

## Common local flows

Development renderer with Electron:

```bash
cd apps/link-desktop
npm run dev
```

Build and start Electron directly:

```bash
cd apps/link-desktop
npm start
```

Restart an existing development run:

```bash
cd apps/link-desktop
npm run restart
```

Stream Electron logs:

```bash
./script/build_and_run.sh --logs
```

## Troubleshooting

If Electron opens a blank screen, rebuild with `./script/build_and_run.sh --verify` and check that `apps/link-desktop/dist/renderer/index.html` exists.

If a managed surface says it is not configured, confirm the related service URL and auth context in Settings or `.env.local`. Do not enable local fallback flags when testing production-like behavior.

If Google Workspace prompts repeatedly on macOS, confirm Link is using its encrypted file keyring under Electron user data through `GOG_KEYRING_BACKEND=file`, `GOG_HOME`, and `GOG_KEYRING_PASSWORD`.

If App Publisher publish actions are disabled, check `/readyz` on `LINK_APP_PUBLISHER_URL` and confirm reviewer enforcement, persistent storage, auth context, Git, `telnyx-edge`, and deployer mode are configured for production-like publishers.

If tests fail after a docs-only change, check the current working tree first. This repo often has in-progress desktop edits, and unrelated local changes can affect package checks.
