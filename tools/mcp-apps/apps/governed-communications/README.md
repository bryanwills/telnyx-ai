# Governed Communications

`@telnyx-mcp-apps/governed-communications` is a focused MCP app for operator-safe outbound communications workflows. It exposes a bounded V1 surface for:

- `communications_send_message`
- `communications_start_call`
- `communications_start_verification`
- `communications_get_message_status`
- `communications_get_call_status`
- `communications_get_call_timeline`
- `communications_get_verification_status`
- `communications_list_owned_senders`

## Safety model

- Mutating tools require caller-supplied `idempotency_key`.
- Sender, messaging-profile, connection, and verify-profile selectors are enforced from environment allowlists.
- Timeline reads cap page size and time window.
- Model-visible output redacts phone numbers, message bodies, verification secrets, and sensitive URLs by default.

## Environment

- `TELNYX_API_KEY` — required for live calls.
- `COMMUNICATIONS_ALLOWED_MESSAGE_SENDERS`
- `COMMUNICATIONS_ALLOWED_MESSAGING_PROFILES`
- `COMMUNICATIONS_ALLOWED_CALL_FROM_NUMBERS`
- `COMMUNICATIONS_ALLOWED_CALL_CONNECTIONS`
- `COMMUNICATIONS_ALLOWED_VERIFY_PROFILES`
- `COMMUNICATIONS_ALLOWED_VERIFY_CHANNELS`
- `COMMUNICATIONS_DEFAULT_POLICY_TAG`
- `COMMUNICATIONS_MAX_MEDIA_URLS`
- `COMMUNICATIONS_MAX_PAGE_SIZE`
- `COMMUNICATIONS_MAX_TIMELINE_WINDOW_HOURS`
- `COMMUNICATIONS_IDEMPOTENCY_TTL_MS`

## Checks

From `tools/mcp-apps`:

```sh
npm run typecheck --workspace @telnyx-mcp-apps/governed-communications
npm run build --workspace @telnyx-mcp-apps/governed-communications
npm run test --workspace @telnyx-mcp-apps/governed-communications
```

## Contract note

The sibling contract issue (`TEL-218`) is still in progress. This app currently implements the TEL-216 V1 tool names and guardrails with a narrow selector-based interpretation so the runtime path exists before the finalized contract document lands.
