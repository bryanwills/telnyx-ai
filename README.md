# Telnyx Link

Telnyx Link is a desktop AI workspace for Telnyx employees. It brings together agents, company knowledge, skills, memory, phone workflows, tasks, and approved actions in one place.

Link is designed for everyday internal work: asking questions, finding the right context, drafting customer-safe responses, working with internal agents, creating documents, reviewing tasks, and tracking follow-up work in Taskbox.

## What You Can Do

- Chat with personal and directory agents.
- Search company knowledge in Wiki.
- Use Telnyx Skills and squad kits in Wiki.
- Track tasks and agent handoffs in Taskbox.
- Publish and review internal apps through the managed Apps flow.
- Use Memory Bank for long-term agent memory and recall.
- Configure Phone, contacts, SIP/WebRTC, and Telnyx AI Assistants.
- Review and approve Link-generated drafts before external/customer-visible action.
- Connect internal tools from Settings when you need additional access.

## Getting Started

Run the desktop app:

```sh
./script/build_and_run.sh
```

When Link opens:

1. Sign in with Telnyx Okta from Settings or the onboarding flow.
2. Connect the tools you want Link to use.
3. Pick an agent in Agent Chat.
4. Start with a question, a customer/account briefing, or a task you want Link to help with.

## Main Pages

### Agent Chat

A persistent chat workspace for personal agents, hosted agents, and Slack-connected bots. Agent Chat can create local Taskbox review tasks when an answer needs follow-up.

### Phone

Configure phone settings, contacts, SIP/WebRTC details, and Telnyx AI Assistants.

### My Agents

Find and work with agents available through Telnyx systems.

### Taskbox

Track active work in a kanban-style board.

### Memory Bank

Browse and prompt Hindsight-backed memory banks, including documents, memories, entities, and bank settings.

### Wiki

Search internal documentation, inspect Telnyx Skills, and equip your agents with squad kits and internal app capabilities.

### Apps

Publish, review, duplicate, roll back, and deprecate internal Link apps through the managed Link App Publisher contract.

### Settings

Manage Okta access, credentials, agent plugins, design system preferences, and setup state.

## Safety

Link is built around explicit user control:

- Customer-visible actions require review or approval.
- Shared-channel drafts separate customer-safe text from internal rationale.
- Credentials are managed in Settings and are not shown again after being saved.
- Memory writes are intentional, not silent.
- Tool access is permission-aware.

## For Developers

Run checks before shipping changes:

```sh
cd apps/link-desktop
npm run typecheck
npm test
npm run build
```

For Link runtime changes:

```sh
cd tools/link
npm run typecheck
npm test
```

For the private Link Skill Registry service:

```sh
cd tools/link-skill-registry
npm run build
```
