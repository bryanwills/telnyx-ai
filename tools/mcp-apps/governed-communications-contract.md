# Governed Communications MCP Contract

This document defines the V1 contract for a governed Telnyx communications MCP app. It is the implementation source for the future app package, framework examples, and follow-up operator docs.

The strategy note referenced by `TEL-218` (`plans/2026-05-23-tel-216-tool-connector-patterns.md`) is not present in this checkout. This contract therefore anchors itself to the existing MCP app patterns in `tools/mcp-apps/` and the control-boundary guidance in `managed-telecom-agents.md`.

## Goals

- Expose a narrow communications tool surface that works across MCP hosts without leaking raw Telnyx API shapes into every client.
- Make selector policy, approval requirements, and idempotent mutation semantics explicit enough to test with fixtures.
- Preserve the IDs operators need for escalation while redacting secrets and optional sensitive content.

## Non-Goals

- Expose the full Telnyx API.
- Let hosts bypass policy selection by posting raw connection IDs, profile IDs, or API paths.
- Normalize every upstream Telnyx field. V1 normalizes the operational contract and preserves provider payloads only in bounded `provider` sections when enabled.

## App Identity

- App slug: `governed-communications`
- Transport: stdio MCP server with optional hosted HTTP wrapper, matching the pattern already used in `tools/mcp-apps`
- Default runtime posture: governed write surface with approval and selector policy checks on every mutating tool

## V1 Tools

V1 includes six tools.

| Tool | Category | Purpose |
| --- | --- | --- |
| `communications_list_owned_senders` | read | Discover numbers, messaging profiles, and voice-capable senders the account owns and may use under policy |
| `communications_send_message` | mutate | Send an SMS or MMS through a policy-selected sender/profile |
| `communications_start_outbound_call` | mutate | Start an outbound voice call through a policy-selected connection/application |
| `communications_start_verification` | mutate | Start an SMS or voice verification workflow |
| `communications_get_status` | read | Fetch normalized status for a prior message, call, or verification attempt |
| `communications_get_call_timeline` | read | Return normalized call events for an existing call, session, or policy correlation window |

`communications_get_status` is intentionally generic across resource types because the issue scope calls for status retrieval as a single V1 capability. Hosts should not need separate status tools to handle common polling flows.

## Shared Request Envelope

Every tool accepts its own arguments plus these shared top-level fields.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `request_id` | string | no | Caller-generated trace ID echoed back in the response |
| `policy_context` | object | no | Hints for selector evaluation such as environment, project, campaign, geography, or tenant labels |
| `approval` | object | no | Approval token or confirmation mode metadata for governed mutating tools |
| `idempotency_key` | string | mutating tools: yes | Stable caller-supplied key for dedupe and replay |
| `include_provider_payload` | boolean | no | Defaults to `false`; when `true`, a redacted provider block may be included |

`policy_context` is advisory. Policy can use it to narrow matches, but callers cannot force policy bypass by setting values that conflict with the server's own configuration.

## Shared Response Envelope

Every tool returns a normalized object with the same top-level shape.

```json
{
  "ok": true,
  "tool": "communications_send_message",
  "request_id": "req_01jwc7mkyj8f6fh0xv2m8f4s8q",
  "operation": {
    "id": "op_01jwc7n6f7f9ng74jfn6bdw0ta",
    "resource_type": "message",
    "resource_id": "msg_01jwc7nb9m4v8cb8shqk9d9s8m",
    "status": "accepted"
  },
  "policy": {
    "name": "default-us-messaging",
    "version": "2026-05-23",
    "decision": "allow",
    "selector_result": {
      "sender_id": "1293384261075731499",
      "sender_type": "long_code",
      "messaging_profile_id": "4001777e-8010-4c9f-9f7c-935e0f8a4f38"
    }
  },
  "approval": {
    "mode": "auto",
    "state": "approved",
    "reference": null
  },
  "idempotency": {
    "key": "idem-msg-20260523-001",
    "first_seen_at": "2026-05-23T17:22:40Z",
    "replayed": false
  },
  "data": {},
  "warnings": [],
  "provider": null
}
```

Top-level response rules:

- `ok=true` means the tool completed and `data` is populated.
- `ok=false` means the tool failed and an `error` object replaces `data`.
- `operation.id` is the governed app operation ID, not necessarily the raw Telnyx resource ID.
- `operation.resource_id` preserves the normalized provider resource identifier when one exists.
- `provider` is omitted or `null` unless `include_provider_payload=true`.

## Policy Model

The server owns policy configuration. MCP callers can only provide hints.

### Policy Object

The runtime policy model should support this shape:

```json
{
  "policies": [
    {
      "name": "default-us-messaging",
      "version": "2026-05-23",
      "applies_to": ["communications_send_message"],
      "match": {
        "environment": ["prod"],
        "channel": ["sms", "mms"],
        "countries": ["US", "CA"],
        "tags": ["customer-notifications"]
      },
      "selector": {
        "sender_pool": "north-america-notifications",
        "messaging_profile": "default-a2p",
        "fallback_sender_pool": "shared-overflow"
      },
      "approval_mode": "auto"
    }
  ]
}
```

### Selector Inputs

The selector engine may evaluate:

- tool name
- destination country and channel
- caller `policy_context.environment`
- caller `policy_context.tenant`
- caller `policy_context.tags`
- content classification supplied by the host, such as `notification`, `otp`, or `support`
- compliance state implied by server-side policy, such as whether a sender pool may carry verification traffic

### Selector Outputs

Selectors resolve platform-specific resources into a normalized result with fields such as:

- `sender_id`
- `sender_type`
- `messaging_profile_id`
- `from`
- `connection_id`
- `call_control_application_id`
- `verification_profile_id`
- `country_code`
- `tags`

Selectors must not return secrets. If a selector cannot produce an allowed route, the tool fails with `policy_denied`.

## Approval Modes

V1 approval is tool-scoped and policy-driven.

| Mode | Meaning | Allowed tools |
| --- | --- | --- |
| `auto` | Execute immediately after selector/policy validation | any tool |
| `confirm` | Caller must provide an approval token created by a server-side preview or out-of-band approval step | mutating tools only |
| `deny` | Tool is exposed but policy forbids execution for the matched context | any tool |

Approval contract:

- Read tools default to `auto`.
- Mutating tools must return `approval.state=required` and `ok=false` if policy requires `confirm` and the caller omitted a valid token.
- Approval tokens are single-purpose. A token approved for `communications_send_message` cannot be reused for `communications_start_outbound_call`.
- Approval evaluation happens before the provider mutation call but after selector resolution, so the approval payload can reflect the selected sender/connection.

## Idempotency Contract

All mutating tools require `idempotency_key`.

Rules:

- The dedupe scope is `(tool name, idempotency_key, policy identity, normalized request fingerprint)`.
- Reusing the same key with a materially different normalized request must fail with `idempotency_conflict`.
- Reusing the same key with the same normalized request must return the original result with `idempotency.replayed=true`.
- The original governed `operation.id` is returned on replay.
- Provider idempotency headers may be used internally, but the governed app response is authoritative for replay semantics.

Normalization for fingerprinting should include:

- selected tool name
- normalized destination(s)
- normalized content or template references
- normalized selector result
- normalized approval mode
- resource-specific inputs such as timeout seconds or verification channel

## Normalized Error Taxonomy

Errors use a stable app-level taxonomy so framework code does not need to inspect raw Telnyx responses.

```json
{
  "ok": false,
  "tool": "communications_send_message",
  "request_id": "req_01jwc8a6nx6rbh5h0k9qkz6cna",
  "operation": {
    "id": "op_01jwc8b5a0h5gbqwt4ws5pg6fv",
    "resource_type": "message",
    "resource_id": null,
    "status": "failed"
  },
  "policy": {
    "name": "default-us-messaging",
    "version": "2026-05-23",
    "decision": "deny",
    "selector_result": null
  },
  "approval": {
    "mode": "deny",
    "state": "rejected",
    "reference": null
  },
  "idempotency": {
    "key": "idem-msg-20260523-002",
    "first_seen_at": "2026-05-23T17:29:10Z",
    "replayed": false
  },
  "error": {
    "class": "policy_denied",
    "code": "policy.sender_not_allowed",
    "message": "No allowed sender route matched the request policy.",
    "retryable": false,
    "details": {
      "suggested_action": "Choose an approved sender pool or adjust policy configuration."
    }
  },
  "warnings": [],
  "provider": null
}
```

V1 error classes:

| Class | Retryable | Meaning |
| --- | --- | --- |
| `validation_error` | no | Caller request is malformed or missing required fields |
| `policy_denied` | no | No allowed selector match or policy forbids the requested action |
| `approval_required` | no | A valid approval token or confirmation step is required |
| `idempotency_conflict` | no | The same idempotency key was reused with a different normalized request |
| `not_found` | no | The referenced governed or provider resource is unknown |
| `rate_limited` | yes | Provider or app rate limit exceeded |
| `provider_transient` | yes | Upstream transport or 5xx-class failure that may succeed on retry |
| `provider_terminal` | no | Upstream rejected the request in a non-retryable way |
| `internal_error` | maybe | Unexpected app failure; retry policy is host-dependent |

Error payload rules:

- `error.code` is namespaced and stable, for example `policy.sender_not_allowed` or `provider.timeout`.
- `error.message` is safe for end users and must not contain API keys, auth headers, full card-like strings, or optional secrets.
- `error.details` may preserve safe operational IDs, limits, and normalized filter values.
- If `include_provider_payload=true`, `provider.error` may include redacted upstream context, but framework examples should rely only on the normalized `error` object.

## Tool Contracts

### `communications_list_owned_senders`

Purpose: discover owned senders and governed routing affordances.

Inputs:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `channel` | enum | no | `sms`, `mms`, `voice`, or `all`; defaults to `all` |
| `country_code` | string | no | ISO 3166-1 alpha-2 hint |
| `capabilities` | string[] | no | Values such as `messaging`, `voice`, `verification` |
| `tags` | string[] | no | Policy tag hint |
| `page_size` | integer | no | Server-capped |
| `page_token` | string | no | Cursor for pagination |

Normalized `data`:

- `senders`: array of sender summaries
- `next_page_token`: nullable string
- `applied_filters`: normalized filters after defaults/caps

Sender summary fields:

- `sender_id`
- `sender_type`
- `from`
- `country_code`
- `capabilities`
- `messaging_profile_id`
- `connection_id`
- `policy_eligible`
- `policy_tags`

### `communications_send_message`

Purpose: send an SMS or MMS through a governed selector.

Inputs:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `to` | string or string[] | yes | One or more E.164 destinations; V1 may cap fanout to a small server-defined limit |
| `text` | string | yes unless `media_urls` only template flow is later added | Message body |
| `media_urls` | string[] | no | MMS only; server-capped |
| `sender` | object | no | Optional selector hint such as `from`, `sender_pool`, or `messaging_profile` |
| `content_classification` | enum | no | Recommended: `notification`, `support`, `marketing`, `otp` |

Normalized `data`:

- `message_id`
- `to`
- `from`
- `channel`
- `accepted_at`
- `status`
- `messaging_profile_id`

### `communications_start_outbound_call`

Purpose: start an outbound call through a governed voice route.

Inputs:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `to` | string | yes | E.164 destination |
| `connection` | object | no | Optional selector hint such as `connection_group` or `application_label` |
| `from` | string | no | Optional sender hint; policy may ignore it |
| `webhook_url` | string | no | Optional host callback URL if the future implementation allows it |
| `timeout_secs` | integer | no | Server-capped |
| `metadata` | object | no | Safe, size-capped metadata |

Normalized `data`:

- `call_control_id`
- `call_leg_id`
- `call_session_id`
- `to`
- `from`
- `connection_id`
- `status`
- `started_at`

### `communications_start_verification`

Purpose: start an OTP or identity verification flow using a governed profile.

Inputs:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `to` | string | yes | E.164 destination |
| `channel` | enum | yes | `sms` or `call` |
| `brand` | string | no | Selector hint |
| `locale` | string | no | BCP 47 locale hint |
| `code_length` | integer | no | Server may ignore if profile fixes length |
| `ttl_secs` | integer | no | Server-capped |

Normalized `data`:

- `verification_id`
- `to`
- `channel`
- `profile_id`
- `status`
- `started_at`
- `expires_at`

### `communications_get_status`

Purpose: poll the normalized status of a previously created message, call, or verification.

Inputs:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `resource_type` | enum | yes | `message`, `call`, or `verification` |
| `resource_id` | string | yes | Normalized provider ID |

Normalized `data`:

- `resource_type`
- `resource_id`
- `status`
- `updated_at`
- `terminal`
- `direction`
- `failure_reason`
- `timeline_hint`

`timeline_hint` is optional. For calls it may include a suggested `call_control_id` or `call_session_id` to pass into `communications_get_call_timeline`.

### `communications_get_call_timeline`

Purpose: return a normalized timeline for an existing call.

Inputs:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `call_control_id` | string | no | One of the primary call identifiers is required |
| `call_session_id` | string | no | One of the primary call identifiers is required |
| `call_leg_id` | string | no | Optional secondary filter |
| `connection_id` | string | no | Optional filter |
| `start_time` | string | no | ISO timestamp; bounded by server caps |
| `end_time` | string | no | ISO timestamp; bounded by server caps |
| `page_size` | integer | no | Server-capped |
| `page_token` | string | no | Cursor for pagination |

Normalized `data`:

- `events`: array of normalized timeline events
- `next_page_token`: nullable string
- `applied_filters`: normalized/capped filters

Timeline event fields:

- `event_id`
- `occurred_at`
- `event_type`
- `call_control_id`
- `call_session_id`
- `call_leg_id`
- `connection_id`
- `direction`
- `details`

## Sensitive Data Rules

The governed app must preserve operational IDs but redact or omit:

- API keys and Authorization headers
- webhook signing secrets
- payment-like values if they ever appear in upstream errors
- full transcripts unless a future policy explicitly allows them
- recording URLs unless a future policy explicitly allows them
- arbitrary metadata blobs that are not required for routing or support

Phone numbers may be preserved in mutating tool outputs because send and call tools inherently operate on explicit destinations. Read tools should prefer redacted display fields when full numbers are not required.

## Fixture Set

V1 fixtures live in `tools/mcp-apps/fixtures/governed-communications/`.

| Fixture | Purpose |
| --- | --- |
| `success-send-message.json` | Successful governed message send |
| `policy-denial-send-message.json` | Selector/policy denial before mutation |
| `transient-upstream-failure-call.json` | Retryable upstream failure during outbound call start |
| `idempotent-replay-start-verification.json` | Successful replay of a prior verification start |

These fixtures are intended as the compatibility corpus for the future app tests and framework examples.

## Compatibility Notes

- Framework adapters should branch on `ok`, `error.class`, and `idempotency.replayed`, not on raw provider payloads.
- Hosts that require human confirmation should treat `approval_required` as a first-class pause state and store the governed `operation.id`.
- The future MCP app may add preview tools or approval-token issuance helpers, but V1 of this contract does not require them to define the response model.

## Implementation Checklist

- Implement the six tool names exactly as defined above.
- Enforce policy selection before calling the provider for all mutating tools.
- Require `idempotency_key` on all mutating tools and replay prior successful results.
- Return only the normalized error classes from this document at the app boundary.
- Keep the fixture corpus passing as the implementation evolves.
