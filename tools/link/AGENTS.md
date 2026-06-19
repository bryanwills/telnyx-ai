# Telnyx Cloud Link Instructions

This package contains the local Telnyx Cloud Link runtime plus the managed-service contracts that the desktop app consumes.

Preserve these boundaries:

- Keep the local tool runtime deterministic and mocked until a real integration has a reviewed permission, audit, and test boundary.
- Do not add secrets, API keys, Okta config, Slack tokens, Salesforce credentials, Snowflake credentials, Datadog credentials, or Telnyx production data access.
- Shared customer channel drafts must be customer-safe and approval-required before posting.
- Keep customer-facing drafts separate from internal rationale, raw logs, internal links, private account notes, and internal Slack context.
- Add tests when adding tools, skills, agents, approval policies, or shared-channel behavior.
- Run `npm run typecheck` and `npm test` from `tools/link` before declaring Link changes done.
- Document new Link behavior in `tools/link/README.md`.
- Use `tools/link/docs/glass-reference.md` as product inspiration for future UI, connectors, memory, and skill publishing work, but do not copy Ramp branding, screenshots, icons, assets, or proprietary implementation details.
