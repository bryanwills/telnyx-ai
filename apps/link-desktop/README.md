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

Verification:

```bash
npm run metadata:check
npm run typecheck
npm test
npm run build
```

`meta-dev.yml` follows [PADR-1 Service Metadata Specification](https://platform-handbook.internal.telnyx.com/decision_record/architecture/padr-0001_service_metadata_spec/). If `meta-prod.yml` is added later, `npm run metadata:check` validates the merged dev+prod view through `infra-svc-metatool`.

## Current Surfaces

- Workspaces with persisted tabs, Link-created files, automations, approvals, and change requests
- Explorer search across mocked Guru, Google Drive, Link files, skills, agents, and memory
- Chats with Telnyx LiteLLM-ready runtime fallback and admin-reviewed Link improvement requests
- Skills from `tools/link/skills` and the root Telnyx Git-backed `skills/` directory
- Agents directory with Agent Control Plane Okta readiness and mocked fallback agents
- Connections with connector status and Auto/Allow/Ask tool permission groups
- Memory with Hindsight-ready banks, recall testing, and explicit refresh state
- Dojo with personal and squad bot training kits
- Experto Apps publishing through the managed Link App Publisher contract, with live VPN-only API handoff and local fallback catalog state
- Internal Design System and Settings surfaces

Generated drafts, approval decisions, automations, and connector request state are persisted in Electron user data.

The app uses hybrid live-ready adapters. It contacts production services only when the related saved credentials, environment variables, or Okta session are configured; otherwise it returns deterministic mocked data.

## Link App Publisher

Experto Apps is wired for the managed publisher service rather than direct Edge Compute deployment from the desktop app. The desktop bridge exposes fixed IPC methods for catalog listing, publish intents, version requests, review decisions, duplication handoff, and opening approved VPN URLs. The publisher service owns source bundle handling, isolated builds, Edge Compute deployment, version history, and catalog promotion.

The default service URL is `https://link-app-publisher.query.prod.telnyx.io`; set `LINK_APP_PUBLISHER_URL` only for a private test publisher. Link authenticates with the saved Okta Rev2 token or `TELNYX_API_KEY`, and only opens approved internal HTTPS app hosts.
