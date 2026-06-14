# Telnyx Link Desktop Instructions

This package is the Electron desktop shell for Telnyx Link.

- Prefer live-ready adapters with deterministic local fallbacks. Production integrations must stay credential-gated, auditable, and covered by tests.
- Shared customer drafts must preserve the Link approval and redaction boundaries.
- Use `tools/link/docs/glass-reference.md` for product direction, but do not copy Ramp branding or assets.
- Add or update tests for IPC, renderer state, or safety-critical UX changes.
- Run `npm run typecheck`, `npm test`, and `npm run build` from `apps/link-desktop` before declaring desktop changes complete.
- After completing a desktop app work session, restart the local app or preview server before handing off so the running UI reflects the latest bundle. Use the active dev command when one exists; otherwise use `npm run preview -- --port 4173` from `apps/link-desktop` for browser preview work.
