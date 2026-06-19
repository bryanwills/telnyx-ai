# Telnyx Cloud Link Desktop Instructions

This package is the Electron desktop shell for Telnyx Cloud Link.

- Start with `docs/bootstrap.md` for the package bootstrap, credential gates, verification commands, and common troubleshooting paths.
- Prefer live-ready adapters with deterministic local fallbacks. Production integrations must stay credential-gated, auditable, and covered by tests.
- Shared customer drafts must preserve the Cloud Link approval and redaction boundaries.
- Use `tools/link/docs/glass-reference.md` for product direction, but do not copy Ramp branding or assets.
- Add or update tests for IPC, renderer state, or safety-critical UX changes.
- Run `npm run typecheck`, `npm test`, and `npm run build` from `apps/link-desktop` before declaring desktop changes complete.
- After completing a desktop app work session, restart the local app or preview server before handing off so the running UI reflects the latest bundle. Reuse or replace the active Cloud Link process; do not leave multiple Electron copies open.
- On macOS, prefer `../../script/build_and_run.sh` for Electron QA because it builds `tools/link`, builds the renderer, terminates the previous app, prepares the branded development app bundle, and opens `Telnyx Cloud Link.app`. Use `../../script/build_and_run.sh --verify` for launch smoke tests and `../../script/build_and_run.sh --logs` for Electron logs.
- On Windows or Linux, prefer `npm run dev` from `apps/link-desktop` for active development. For a bundled-renderer Windows smoke test, run `npm --prefix ../../tools/link run build`, `npm run build`, then launch from PowerShell with `$env:LINK_DESKTOP_RENDERER="dist/renderer/index.html"; .\node_modules\.bin\electron.cmd .\src\main\main.js`. On Linux, use `LINK_DESKTOP_RENDERER=dist/renderer/index.html ./node_modules/.bin/electron src/main/main.js` after the same build steps.
- Use the active dev command when one exists; otherwise use `npm run preview -- --port 4173` from `apps/link-desktop` for browser preview work.
