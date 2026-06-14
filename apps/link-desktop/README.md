# Telnyx Link Desktop

This is the first Electron desktop shell for Telnyx Link. It is intentionally wired to the mocked `tools/link` runtime and does not connect to production systems.

## Run Locally

```bash
../../script/build_and_run.sh
```

Browser preview for UI QA:

```bash
npm run preview
```

## Local Credentials

The normal setup path is the Settings page. Credential fields there are write-only: saved values are encrypted with Electron `safeStorage`, stored under Electron user data, and never returned to the renderer after save.

`.env.local` remains supported as a developer override. The root `script/build_and_run.sh` and `npm run dev` both load it automatically. Environment variables take precedence over saved Settings credentials.

The Agent Control Plane should use Okta SSO; do not put an Okta password in this file. `TELNYX_ACTOR` and `TELNYX_ON_BEHALF_OF` are optional routing hints for ACP endpoints that require explicit user or squad context.

The Settings view exposes a `Sign in with Okta` action for Agent Control Plane. It opens ACP `/auth/login` in an Electron auth window and keeps the resulting ACP cookies in the Electron session. If a specific hosted agent endpoint requires a squad context, set `TELNYX_ON_BEHALF_OF` to that squad id ending in `.squad`.

GitHub pairing uses a GitHub App device flow. Users only use the GitHub card's `Connect` button: Link shows the device code in a native dialog, opens `https://github.com/login/device`, stores the returned app user token with Electron `safeStorage`, and verifies it can read `team-telnyx/link` by default. Release builds should include the public Telnyx Link GitHub App client ID in `link-desktop-config.json` next to packaged app resources, for example `{ "githubAppClientId": "..." }`. `LINK_DESKTOP_CONFIG_PATH`, `LINK_DESKTOP_CONFIG_JSON`, `LINK_GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_ID`, `GH_TOKEN`, `GITHUB_TOKEN`, and authenticated `gh` remain developer or operator fallbacks. Override the pairing check with `LINK_GITHUB_APP_VERIFY_REPO=owner/repo`.

Google Workspace uses `team-telnyx/openclaw-itops-setup-utils/gog-setup` with the bundled `gog` CLI. Run `npm run bundle:gog` before packaging so `apps/link-desktop/bin/gog-*` is included in app resources. The Settings card only exposes `Connect`: Link fetches and stages the read-only setup utility, signs the user in with Google through gog, stores the gog account/keyring details with Electron `safeStorage`, and only shows `Connected` after Calendar and Contacts checks pass. Link forces gog to use its encrypted file keyring under the Electron user data directory with `GOG_KEYRING_BACKEND=file`, `GOG_HOME`, and a generated `GOG_KEYRING_PASSWORD` so macOS does not repeatedly prompt for the login Keychain. For production, set `GOOGLE_WORKSPACE_SETUP_ASSET_URL` to an Okta-protected internal endpoint that can return files from `team-telnyx/openclaw-itops-setup-utils`; `GOOGLE_WORKSPACE_SKILL_ASSET_URL` remains a compatibility alias. Developer fallbacks still work through `GH_TOKEN`/`GITHUB_TOKEN`, authenticated `gh`, `GOOGLE_WORKSPACE_SETUP_SCRIPT`, and direct `GOOGLE_WORKSPACE_ACCESS_TOKEN`, `GOOGLE_CALENDAR_ACCESS_TOKEN`, `GOOGLE_DRIVE_ACCESS_TOKEN`, or `GOOGLE_CONTACTS_ACCESS_TOKEN`.

Telnyx Whisper lives under `native/telnyx-whisper` and is controlled from Settings > Speech. Link uses the saved Telnyx API key for Telnyx STT/TTS helper calls, starts the macOS helper from the Electron main process, and defaults the dictation shortcut to holding `fn`.

## Runtime Configuration

Most users should connect services through Settings. Operators and developers can use these environment variables for packaged builds, smoke tests, and VPN-only service handoffs:

| Area | Variables | Notes |
| ---- | --------- | ----- |
| Request timeouts | `LINK_DESKTOP_FETCH_TIMEOUT_MS` | Default outbound `fetch` timeout is 15 seconds. Existing call-specific signals, such as long-running knowledge-agent requests, still win. |
| GitHub | `LINK_DESKTOP_CONFIG_PATH`, `LINK_DESKTOP_CONFIG_JSON`, `LINK_GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_ID`, `LINK_GITHUB_APP_VERIFY_REPO`, `GH_TOKEN`, `GITHUB_TOKEN` | GitHub pairing verifies access to `team-telnyx/link` by default. Developer token fallbacks should stay local. |
| Agent Control Plane | `TELNYX_ACTOR`, `TELNYX_ON_BEHALF_OF`, `TELNYX_AUTH_REV2` | Prefer Okta SSO from Settings. Use actor and squad context when ACP or publisher endpoints require it. |
| Link App Publisher | `LINK_APP_PUBLISHER_URL`, `LINK_APP_PUBLISHER_LOCAL_FALLBACK`, `LINK_APP_PUBLISHER_DEPLOYER`, `LINK_APP_PUBLISHER_ENFORCE_REVIEWERS`, `LINK_APP_PUBLISHER_REQUIRE_AUTH_CONTEXT`, `LINK_APP_PUBLISHER_REQUIRE_PUSHED_REF` | Production-like publisher runs should require auth context, reviewer enforcement, persistent storage, and Edge deployer readiness. |
| Link Skill Registry | `LINK_SKILL_REGISTRY_URL`, `LINK_SKILL_REGISTRY_STORAGE`, `LINK_SKILL_REGISTRY_REQUIRE_AUTH_CONTEXT` | Desktop queues local skill events when the registry is unavailable. Production registry runs should require auth context. |
| Pylon MCP | `PYLON_MCP_URL`, `PYLON_MCP_CLIENT_ID`, `PYLON_MCP_ACCESS_TOKEN`, `PYLON_MCP_REFRESH_TOKEN`, `PYLON_MCP_TOKEN_EXPIRES_AT` | Settings should own normal OAuth setup. Link allows read tools and `create_issue`; update tools are blocked. |
| Google Workspace | `GOOGLE_WORKSPACE_SETUP_ASSET_URL`, `GOOGLE_WORKSPACE_SKILL_ASSET_URL`, `GOOGLE_WORKSPACE_SETUP_SCRIPT`, `GOG_ACCOUNT`, `GOOGLE_WORKSPACE_ACCESS_TOKEN`, `GOOGLE_CALENDAR_ACCESS_TOKEN`, `GOOGLE_DRIVE_ACCESS_TOKEN`, `GOOGLE_CONTACTS_ACCESS_TOKEN` | Production should use an Okta-protected setup asset. Direct access-token variables are developer fallbacks. |
| Google OAuth | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_WORKSPACE_REFRESH_TOKEN`, `GOOGLE_WORKSPACE_TOKEN_EXPIRES_AT` | Used by saved Google Workspace connections when token refresh is configured. |
| Guru | `GURU_OAUTH_CLIENT_ID`, `GURU_OAUTH_CLIENT_SECRET`, `GURU_OAUTH_SCOPE`, `GURU_OAUTH_REDIRECT_URI`, `GURU_OAUTH_ACCESS_TOKEN`, `GURU_OAUTH_REFRESH_TOKEN`, `GURU_OAUTH_TOKEN_EXPIRES_AT`, `GURU_USER_EMAIL`, `GURU_USER_TOKEN` | Prefer OAuth. Basic-token fields remain compatibility fallbacks. |
| Telnyx APIs | `TELNYX_API_KEY`, `LINK_DESKTOP_LIVE_CALL_E2E`, `LINK_DESKTOP_LIVE_CALL_CONFIRM`, `LINK_DESKTOP_LIVE_CALL_SECONDS` | Live call E2E is opt-in and hangs up automatically after the configured duration. |
| Local terminal | `LINK_DESKTOP_ENABLE_TERMINAL` | Development builds expose the built-in terminal. Packaged builds require `LINK_DESKTOP_ENABLE_TERMINAL=1` before launch because the terminal can run arbitrary local shell commands. |
| Docs and memory adapters | `INTERCOM_ACCESS_TOKEN`, `INTERCOM_API_BASE_URL`, `INTERCOM_VERSION`, `MINTLIFY_API_KEY`, `MINTLIFY_API_BASE_URL`, `MINTLIFY_DOMAIN`, `HINDSIGHT_API_KEY`, `HINDSIGHT_API_URL`, `HINDSIGHT_BANK_ID` | If unset or unreachable, Link falls back to deterministic local data where available. |
| MCP and widgets | `MCP_PROXY_URL`, `TABLEAU_WIDGETS_SERVICE_URL` | VPN-only service adapters should fail closed or use local cached state when unavailable. |

Verification:

```bash
npm run metadata:check
npm run typecheck
npm test
npm run build
npm run whisper:test
npm run whisper:build
```

Phone dialer E2E:

```bash
npm run test:e2e:phone
```

That command runs a mocked browser E2E against the Standard, Sales, and Support dialers and verifies they call `+14158663106` through the WebRTC softphone path without placing a real call. To place a real Electron call, first build the renderer, then opt in explicitly:

```bash
npm run build
LINK_DESKTOP_LIVE_CALL_E2E=1 LINK_DESKTOP_LIVE_CALL_CONFIRM=+14158663106 npm run test:e2e:phone
```

Live mode uses the saved Telnyx API key and hangs up after `LINK_DESKTOP_LIVE_CALL_SECONDS` seconds, defaulting to 5.

App publisher Electron E2E:

```bash
npm run test:e2e:publisher
```

That command builds `tools/link` plus the desktop renderer, starts a local managed Link App Publisher with auth and actor/group context required, launches Electron against it, and verifies the Apps catalog, duplicate/fork handoff, and reviewer approval path through the real preload IPC bridge. It intentionally uses the record-only deployer, so `/readyz` reports publisher reachable but not production Edge-ready.

`meta-dev.yml` follows [PADR-1 Service Metadata Specification](https://platform-handbook.internal.telnyx.com/decision_record/architecture/padr-0001_service_metadata_spec/). If `meta-prod.yml` is added later, `npm run metadata:check` validates the merged dev+prod view through `infra-svc-metatool`.

## Current Surfaces

- Workspaces with persisted tabs, Link-created files, automations, approvals, and change requests
- Explorer search across Telnyx Help Center, Developer Docs, mocked Guru, Google Drive, Link files, skills, agents, and memory
- Chats with Telnyx LiteLLM-ready runtime fallback and admin-reviewed Link improvement requests
- Skills from `tools/link/skills` and the root Telnyx Git-backed `skills/` directory
- Agents directory with Agent Control Plane Okta readiness and mocked fallback agents
- Connections with connector status and Auto/Allow/Ask tool permission groups
- Memory with Hindsight-ready banks, recall testing, and explicit refresh state
- Wiki with personal and squad bot training kits
- Apps publishing through the managed Link App Publisher contract, with live VPN-only API handoff and local fallback catalog state
- Internal Design System and Settings surfaces

Generated drafts, approval decisions, automations, and connector request state are persisted in Electron user data.

The app uses hybrid live-ready adapters. It contacts production services only when the related saved credentials, environment variables, or Okta session are configured; otherwise it returns deterministic mocked data.

## Task Board Status Architecture

All Link task boards use the same four stages: `Needs Review`, `To Do`, `In Progress`, and `Done`. New unstarted tasks land in `To Do`; sending a task to an ACP agent moves it to `In Progress`; when an agent finishes and has a final response ready, it moves the task to `Needs Review`; a human reviewer moves accepted or closed work to `Done`.

Link injects this operating guide into task monitoring chat sessions and live ACP routing prompts so agents know to use `Needs Review`, not `Done`, when handing completed agent work back to a human.

## Link App Publisher

Apps publishing is wired for the managed publisher service rather than direct Edge Compute deployment from the desktop app. The desktop bridge exposes fixed IPC methods for catalog listing, publish intents, version requests, review decisions, rollback/deprecation, duplication handoff, and opening approved VPN URLs. The publisher service owns source-ref handling, Edge Compute deployment, version history, and catalog promotion.

The default service URL is `https://link-app-publisher.query.prod.telnyx.io`; set `LINK_APP_PUBLISHER_URL` only for a private test publisher. Link authenticates with the saved Okta Rev2 token or `TELNYX_API_KEY`, and only opens approved internal HTTPS app hosts.

The Apps page calls `/readyz` and shows a publisher status banner. If it says `Connect VPN`, the catalog is showing local/default data and publish/open actions are not exercising the managed VPN service yet.

To publish a local app, add `link-app.yml` at the app directory root, commit the app to a `team-telnyx` GitHub repo, then use Apps > Create > App > Load `link-app.yml`. Link reads the manifest locally, derives the Git remote/current commit/source subdir, and sends only that source reference to the managed publisher.

```yaml
name: Carrier Readiness Hub
slug: carrier-readiness-hub
description: Review carrier launch gates before customer updates.
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

For a non-UI smoke of the same path:

```bash
cd tools/link
npm exec -- telnyx-link publish-local-app /path/to/app --dry-run
npm exec -- telnyx-link publisher-e2e-smoke /path/to/app --publisher-url=http://127.0.0.1:4300 --dev-no-auth
npm exec -- telnyx-link publisher-e2e-smoke /path/to/app \
  --publisher-url=https://link-app-publisher.query.prod.telnyx.io \
  --reviewer-groups=messaging-ops.squad \
  --require-ready \
  --require-pushed-ref \
  --check-app-url
```

The smoke inspects the manifest, submits the publish intent, approves it, lists deployment records, fetches the latest sanitized deployment log payload, verifies the optional app URL, and returns the duplicate/fork source handoff. That handoff includes structured clone, checkout, and subdirectory commands pinned to the reviewed source ref.

Local end-to-end publisher check:

```bash
cd tools/link
npm run build
npm exec -- telnyx-link app-publisher 4300 --storage ./publisher-catalog.json
```

In another shell:

```bash
cd apps/link-desktop
LINK_APP_PUBLISHER_URL=http://127.0.0.1:4300 TELNYX_API_KEY=dev-publisher-token npm start
```

Managed publish mutations fail closed when the publisher is unavailable or authentication is missing. Set `LINK_APP_PUBLISHER_LOCAL_FALLBACK=1` only for explicit offline development.

For a production-like Edge handoff, start the publisher with `--edge-deployer` or `LINK_APP_PUBLISHER_DEPLOYER=telnyx-edge`. The publisher service then clones the submitted `team-telnyx` source ref, runs an allowlisted `install_command` or infers one from lockfiles, runs the manifest `build_command`, verifies `output_dir`, and runs `telnyx-edge ship` in `source_subdir`; Link Desktop still only talks to the managed publisher API. Set `LINK_APP_PUBLISHER_REQUIRE_PUSHED_REF=1` for desktop dogfood builds that should reject local-only commits before submission.

The production smoke can use `--check-app-url` to verify the approved private app URL responds over the VPN. The Edge deployer also rejects deployment URLs outside approved Telnyx internal/VPN hostnames before they reach the catalog. The managed API also exposes version history, rollback, ownership transfer, and deprecation endpoints so the catalog remains operable after the first publish.

For reviewer policy, start the publisher with `--enforce-reviewers` or `LINK_APP_PUBLISHER_ENFORCE_REVIEWERS=1`. Link Desktop forwards configured actor/group context so the service can require approvals from the app's reviewers or owning squad. Production publishers should also set `LINK_APP_PUBLISHER_REQUIRE_AUTH_CONTEXT=1` or pass `--require-auth-context`, which makes `/readyz` fail until API requests are required to carry actor/group context from the VPN/Okta boundary.

Before routing desktop users to a production publisher, verify readiness:

```bash
curl -fsS https://link-app-publisher.query.prod.telnyx.io/readyz
```

Readiness requires persistent catalog storage, reviewer enforcement, required auth context, Git, an installed/authenticated `telnyx-edge` CLI, and the Edge deployer mode. Local record-only mode returns `503` by design.
