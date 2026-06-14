---
name: google-agent
description: Connect Google Workspace for Calendar, Drive, Meet artifacts, notes, transcripts, and contact workflows.
product: google-workspace
language: guide
---

# Google Agent

Use this skill when Link needs to connect Google Workspace and verify that Calendar and Contacts are reachable before showing a connected state.

## Workflow steps

- Resolve the Google Agent skill from the Telnyx skill library.
- Create or reuse the Link Google Workspace connection.
- Open Google OAuth in the system browser when Link does not already have verified Google API tokens.
- Grant Link read access to Calendar events and Google contacts through Google OAuth.
- Verify Calendar and Contacts API calls before reporting the connector as connected.

## Expected output format

- `connectionId`: durable Link connection identifier for the Google Workspace connection.
- `skill`: Google Agent skill metadata from the Telnyx library.
- `status`: `connected` when the managed Google Agent connection is ready.

## Safety notes

- Do not expose Google OAuth access tokens to the renderer.
- Do not ask users to paste Google access tokens into Link.
- Store OAuth access and refresh tokens only in Electron secure storage.
