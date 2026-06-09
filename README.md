# Telnyx Link

Telnyx Link is a desktop AI workspace for Telnyx employees. It brings together agents, company knowledge, skills, memory, phone workflows, tasks, and approved actions in one place.

Link is designed for everyday internal work: asking questions, finding the right context, drafting customer-safe responses, working with internal agents, creating documents, reviewing tasks, and improving Link itself through admin-reviewed change requests.

## What You Can Do

- Chat with personal and directory agents.
- Search company knowledge in Company Library.
- Use Telnyx Skills and squad kits in Experto Crede.
- Work from a Widgets dashboard with reports and saved views.
- Track tasks in Task Board.
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

### Widgets

Your home dashboard for reports, snapshots, and operational widgets.

### Agent Chat

A persistent chat workspace for personal agents, hosted agents, and Slack-connected bots. Agent Chat can also create reviewable Link improvement requests.

### Phone

Configure phone settings, contacts, SIP/WebRTC details, and Telnyx AI Assistants.

### My Agents

Find and work with agents available through Telnyx systems.

### Company Library

Search internal documentation, Link-created files, Telnyx Skills, agents, and connected knowledge sources.

### Task Board

Track active work in a kanban-style board.

### Memory Bank

Browse and prompt Hindsight-backed memory banks, including documents, memories, entities, and bank settings.

### Experto Crede

Train and equip your agents with Telnyx Skills, squad kits, and internal app capabilities.

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
