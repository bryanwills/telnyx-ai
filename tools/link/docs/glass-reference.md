# Glass-Inspired Product Reference

Telnyx Cloud Link is inspired by Ramp's Glass as a product pattern: an internal AI coworker that feels like a preconfigured workspace, not a generic chatbot. This is reference material for product direction, not permission to copy Ramp's branding, screenshots, icons, assets, copy, or implementation.

## Product Patterns To Carry Forward

- Desktop-first personal workspace with a quiet dark interface, persistent left navigation, and fast access to chat, tools, skills, memory, and settings.
- A full workspace, not a single chat thread: users should eventually be able to split panes, keep multiple sessions open, preview artifacts, and return to a persisted layout.
- Active work should be visible as a queue of pending or running tasks, with clear approval and dismiss actions for human review.
- A skill marketplace backed by markdown files in Git, exposed to non-engineers as a simple publish and review flow under clear product labels such as Wiki, Skills, or Apps.
- Skill discovery should include an AI guide that recommends skills from connected tools, role, team, and recent work, rather than forcing users to browse a large catalog.
- Connected tools surfaced as first-class objects with connection state, permission controls, and readable capability descriptions.
- Tool permissions grouped by read-only, write/delete, and interactive actions, with clear Auto, Allow, and Ask modes.
- Shared-channel and customer-visible actions must default to Ask or explicit approval.
- Memory refresh as a visible background workflow that scans approved sources, shows progress, and can be cancelled.
- Memory should be write-once-read-many: background synthesis writes inspectable memory files, sessions read them at startup, and chat turns do not silently mutate memory.
- Prepackaged internal tools should reduce setup friction, with SSO and token refresh hidden behind simple connection states.
- Broken integrations should self-heal when possible or explain the next human action in plain language.
- UI should make every menu action available through conversation over time.
- Scheduled automations should run daily, weekly, or on custom cron and post approved results to internal channels.
- Slack-native assistants should be configurable from the same Link setup, using approved tools, memory, and skills.
- Long-running tasks should support headless mode with mobile-friendly approval prompts and results waiting when the user returns.

## Visual Direction

- Use a restrained dark desktop-app shell with clear hierarchy, low ornamentation, and small, dense controls.
- Prefer a narrow icon rail plus a contextual sidebar for lists such as connectors, skills, memories, or chat sessions.
- Use small status dots for connection and warning states.
- Use neon yellow-green only as a sparing primary accent, not as a full-page palette.
- Use professional Telnyx-native naming and iconography. Subtle Zelda-inspired names are acceptable, but avoid over-theming.
- Do not use Ramp, Glass, Zelda, Nintendo, or third-party copyrighted assets.

## Screens Represented By The References

- Memory refresh modal scanning connected sources such as Slack, Notion, Calendar, and Linear.
- Skills screen with a centered user progress panel and skill-kit grid.
- Connector settings screen with connected and available tools, per-tool permission modes, and read/write/interactive groupings.
- Design system screen showing button, icon button, badge, status dot, segmented control, toggle, text input, and search input variants.
- Active work review screen with pending items, artifact previews, change summaries, and approve or dismiss actions.
- Automation editor screen with frequency, time, channels, tools, attached skills, instructions, run history, and active or paused state.

## Engineering Lessons From The Reference Article

- Fast AI-built products need stronger codebase discipline, not less.
- Shared components, design tokens, and documented patterns prevent generated UI fragmentation.
- Documentation validation should ensure new features, skills, and capabilities are described when they change.
- Defrag-style checks should periodically detect duplicated components, inconsistent patterns, and utility reimplementation.
- Pre-commit and PR gates should catch lint, type, test, documentation, and fragmentation issues before they accumulate.
- Long-lived connector sessions can avoid slow per-chat handshakes, while each chat still gets an isolated lightweight wrapper.
- Git is a good backend for skills when the UI makes branching, commits, PRs, review, and publishing invisible to non-engineers.
- Product enablement should happen in the product itself: skills, memory, and contextual recommendations teach users by producing useful work.
- The default should raise the organizational floor without lowering the ceiling for power users.
- Verification infrastructure matters as much as model quality. Agents need sandboxes, tests, status checks, and evidence before high-risk work can be trusted.

## Operating-Layer Thesis

- The project is an internal AI operating layer, not a feature bolted onto chat.
- The scarce resource moves from doing work to specifying work: what should happen, under what constraints, and with what approvals.
- Link should compress the distance between employee intent and safe execution across Telnyx systems.
- Organizational value compounds when one employee's workflow becomes a reusable, versioned skill for everyone.
- Persistent context, permission-aware tools, and auditable execution traces are more important than a single impressive model response.
- Human oversight should move toward monitoring, exception handling, and approval rather than manual execution of every step.

## Adoption Model To Consider

- Define AI proficiency levels for Telnyx employees, from basic use through structured workflows and production-grade agent-assisted work.
- Use Link onboarding to suggest first-day skills by team and role.
- Track whether users get value from installed skills, not just whether they opened chat.
- Treat support requests and feature friction as product telemetry that should feed directly into Link's roadmap.

## Current Link Implications

- The desktop shell now exists; future UI work should keep design tokens and shared components ahead of feature-specific screens.
- Connector work should preserve tool safety metadata and add permission modes before any real production tool access.
- Memory work should use explicit files, source attribution, retention rules, and permission-aware recall.
- Skill publishing should keep markdown skills versioned in Git and approval-reviewed.
- Automation work should reuse the existing approval and audit model before adding scheduling.
- Active-work screens should show artifacts, changes, sources, and approval status as first-class fields.
- Verification work should produce evidence before Link claims a task is complete.
