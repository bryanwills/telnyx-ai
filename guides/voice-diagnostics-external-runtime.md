# Read-Only Voice Diagnostics For External Runtimes

This guide packages one narrow Telnyx pattern for external agent runtimes such as ChatGPT connectors, Copilot Studio, or Salesforce-hosted MCP clients: mount a read-only voice diagnostics app by default, keep follow-up IDs intact, and stop at the write boundary.

## Why this pattern

When an external runtime is asked to investigate a live or recently failed voice AI call, the first operator questions are usually read-only:

- what call is failing
- which webhook or timeline events occurred
- whether latency or provider behavior looks abnormal
- whether a recording or conversation identifier exists for follow-up

That makes `voice-monitor` the right default MCP app because it exposes only diagnostic reads and UI resources, not call-control mutations.

## Runtime shape

Discovery path:

- `GET /apps/voice-monitor`
- `GET /.well-known/mcp-app-registry.json`
- `POST /apps/voice-monitor/mcp`

Runtime contract:

- bind only the `voice_monitor_*` tools returned by discovery or `tools/list`
- treat the per-app `governance.access_mode=read_only` field as authoritative
- preserve these IDs in your orchestration state when they appear:
  - `connection_id`
  - `call_control_id`
  - `call_leg_id`
  - `call_session_id`
  - `assistant_id`
  - `conversation_id`
- expose the `ui://voice-monitor/index.html` resource when the client supports MCP Apps UI resources

## Auth expectations

Use a least-privilege Telnyx API key intended for voice diagnostics reads. The hosted discovery document states that the MCP app uses the same bearer credential shape as the main Telnyx API, but this pattern should not be deployed with a broad write-everything key.

Recommended posture:

- read-only voice or call-monitoring access for the target account
- no operational automation that can answer, hang up, transfer, speak, or reconfigure calls
- rotate the key independently from any broader operator credential used for reviewed write flows

## Action boundary

The read-only diagnostics path is:

1. discover `voice-monitor`
2. run `voice_monitor_dashboard` or `voice_monitor_list_options`
3. inspect `voice_monitor_active_calls`, `voice_monitor_call_timeline`, `voice_monitor_call_status`, `voice_monitor_recordings`, or `voice_monitor_debug_report`
4. summarize findings and preserve the follow-up IDs

This app must not be extended in-prompt to perform write operations. If the runtime decides the next step requires call control or other account mutation, stop and hand off.

## What requires explicit confirmation later

Any future write path should move to a different governed surface or reviewed toolkit flow and capture explicit approval or confirmation before execution. That includes:

- answering, hanging up, transferring, or speaking on a call
- changing call-control application behavior
- creating or mutating recordings, assistants, or related account resources
- any telecom action with billing, traffic, or customer-impact side effects

The point of this pattern is that diagnostics stay safe by default, and write behavior becomes a separate reviewable decision instead of a prompt-level extension.

## Verification path

You can prove the packaging contract from this repo without live calls:

- inspect [tools/mcp-apps/src/http.ts](/Users/olitron/.paperclip-pilot/instances/default/workspaces/f1581f81-bb45-4a83-82d1-b7deca1ecbc4/tools/mcp-apps/src/http.ts) for the public discovery fields
- inspect [tools/mcp-apps/apps/voice-monitor/src/server.ts](/Users/olitron/.paperclip-pilot/instances/default/workspaces/f1581f81-bb45-4a83-82d1-b7deca1ecbc4/tools/mcp-apps/apps/voice-monitor/src/server.ts) for read-only tool annotations
- run the focused tests in `tools/mcp-apps` covering the hosted discovery document and Voice Monitor server registration
