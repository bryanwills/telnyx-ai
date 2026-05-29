# AI Receptionist Missed-Call Capture

> A bounded inbound voice workflow for small-business missed-call capture: answer fast with a Telnyx AI receptionist, collect callback intent, transfer when a human is available, and fall back to SMS confirmation when the call cannot be completed live.

## Prerequisites

- Telnyx API key ([get one free](https://telnyx.com/agent-signup.md))
- One Telnyx phone number assigned to a Call Control application
- A webhook endpoint for assistant events and post-call processing
- Basic familiarity with [AI Voice Assistants](/guides/ai-assistants.md), [Production Voice-Agent Onboarding](/guides/voice-agent-onboarding.md), [Voice Call Control](/guides/voice-call-control.md), and [webhooks](/guides/webhooks.md)

## Workflow At A Glance

Use this pattern when the business goal is narrow:

1. Answer every inbound call immediately with a Telnyx AI assistant.
2. Decide whether the caller should transfer to a live destination now or leave a callback request.
3. Confirm the callback details in-call.
4. Send a same-session SMS confirmation and create a follow-up task after the call.

The bounded path matters more than a generic assistant:

- first-turn latency stays on the Telnyx-managed voice path
- the assistant only needs to capture name, reason, and callback window
- transfer and fallback behavior stay explicit
- post-call systems can reconcile from `call_control_id`, `call_session_id`, and `conversation_id`

## Quick Start

The quickest reference flow is:

1. Create an assistant with a receptionist prompt and one bounded callback-capture tool.
2. Point a Call Control application at the assistant answer webhook.
3. Assign a phone number to that application.
4. On callback capture, send a confirmation SMS and write a CRM or ticket record.
5. After the call, inspect `call.conversation.ended` and the stored conversation for audit and debugging.

```bash
# 1) Create the receptionist assistant
curl -X POST "https://api.telnyx.com/v2/ai/assistants" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SMB Receptionist",
    "model": "openai/gpt-5.4",
    "greeting": "Thanks for calling Acme Plumbing. I can connect you now or help schedule a callback.",
    "instructions": "You are a front-desk receptionist for a small business. Keep replies short. First confirm whether the caller needs live transfer or a callback. If the business is closed, the queue is unavailable, or the caller prefers not to wait, collect the caller name, the best callback number, the reason for the call, and a preferred callback window. Repeat the details back before capture. If details are missing or ambiguous, ask one clarifying question at a time. Never promise immediate human availability. If the caller asks for emergency help or a high-risk action, escalate to a human or emergency instructions immediately.",
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "capture_callback_request",
          "description": "Persist a missed-call callback request and trigger a confirmation SMS after the call.",
          "parameters": {
            "type": "object",
            "properties": {
              "caller_name": { "type": "string" },
              "callback_number": { "type": "string" },
              "reason": { "type": "string" },
              "callback_window": { "type": "string" },
              "urgent": { "type": "boolean" }
            },
            "required": ["caller_name", "callback_number", "reason", "callback_window"]
          }
        }
      }
    ]
  }'
```

Save the returned `assistant_id`.

```bash
# 2) Create a Call Control application wired to the assistant answer webhook
curl -X POST "https://api.telnyx.com/v2/connections" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SMB Receptionist App",
    "active": true,
    "webhook_api_url": "https://api.telnyx.com/v2/ai/assistants/{assistant_id}/answer"
  }'
```

Save the returned `connection_id`.

```bash
# 3) Assign the phone number to that Call Control application
curl -X PATCH "https://api.telnyx.com/v2/phone_numbers/{number_id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "your-connection-id"
  }'
```

```bash
# 4) Send the callback confirmation SMS after your webhook records the request
curl -X POST "https://api.telnyx.com/v2/messages" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+15551234567",
    "to": "+15559876543",
    "text": "Acme Plumbing received your call. We will call you back today between 2 PM and 4 PM about your leaking water heater."
  }'
```

Make one real call to the number. Use that first call to verify that the assistant answers immediately, captures the minimum callback fields, and leaves enough IDs behind to debug the whole path later.

## API Reference

### Create The Assistant

The receptionist configuration should stay intentionally narrow. Do not start with a broad support prompt, deep tool catalog, or CRM reads in the first turn.

```bash
curl -X POST "https://api.telnyx.com/v2/ai/assistants" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SMB Receptionist",
    "model": "openai/gpt-5.4",
    "voice": {
      "provider": "telnyx",
      "settings": {
        "voice_id": "en-US-Neural2-F"
      }
    },
    "greeting": "Thanks for calling Acme Plumbing. How can I help today?",
    "instructions": "Handle receptionist triage, callback capture, and explicit escalation only.",
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "capture_callback_request",
          "description": "Persist a callback request when a live handoff is not available.",
          "parameters": {
            "type": "object",
            "properties": {
              "caller_name": { "type": "string" },
              "callback_number": { "type": "string" },
              "reason": { "type": "string" },
              "callback_window": { "type": "string" }
            },
            "required": ["caller_name", "callback_number", "reason", "callback_window"]
          }
        }
      }
    ]
  }'
```

### Wire The Assistant Answer Webhook

Use the same paved-road answer webhook from the first-call onboarding guide:

`https://api.telnyx.com/v2/ai/assistants/{assistant_id}/answer`

That keeps the latency-sensitive call setup on the Telnyx-managed path instead of forcing the first utterance through a custom application hop.

```bash
curl -X POST "https://api.telnyx.com/v2/connections" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SMB Receptionist App",
    "active": true,
    "webhook_api_url": "https://api.telnyx.com/v2/ai/assistants/{assistant_id}/answer"
  }'
```

### Transfer To A Human When The Queue Is Open

If a live operator or queue is available, transfer instead of forcing callback capture.

```bash
curl -X POST "https://api.telnyx.com/v2/calls/{call_control_id}/actions/transfer" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15557654321"
  }'
```

Use transfer when:

- the caller explicitly asks for a person
- the call is urgent or high risk
- the assistant cannot confirm the callback details safely
- business-hours routing says a receptionist or queue is actually available

### Confirm The Callback By SMS

When the assistant calls `capture_callback_request`, your application should record the request idempotently and send a concise follow-up SMS.

```bash
curl -X POST "https://api.telnyx.com/v2/messages" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+15551234567",
    "to": "+15559876543",
    "text": "Acme Plumbing received your callback request for a leaking water heater. We will call you back today between 2 PM and 4 PM."
  }'
```

The SMS should confirm:

- business identity
- callback window
- the captured reason in plain language
- the fact that the request was received, not fulfilled

### Inspect The Stored Conversation After The Call

The post-call artifacts are the operational record for missed-call handling.

```bash
curl "https://api.telnyx.com/v2/ai/conversations/{conversation_id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY"

curl "https://api.telnyx.com/v2/ai/conversations/{conversation_id}/messages" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

Capture at least these fields from `call.conversation.ended` and your tool webhook event:

- `assistant_id`
- `call_control_id`
- `call_session_id`
- `conversation_id`
- `connection_id`
- the final callback payload you stored

## Latency-Sensitive Path

For this workflow, the latency-sensitive path is only the first turn and the live handoff decision. Keep that path small:

- answer immediately from the assistant answer webhook
- do not wait on CRM lookups before the first greeting
- ask only for the minimum callback fields
- treat SMS sending, CRM writes, and analytics enrichment as asynchronous side effects

If you force every inbound call through a custom orchestrator before the greeting, you lose the point of the Telnyx-native path. The reference flow should prove that telephony, STT, LLM, and TTS can stay colocated while your business system only handles bounded side effects.

## Fallback And Handoff Rules

Use explicit routing rules instead of letting the prompt improvise:

- `transfer now`: staffed hours, operator available, caller wants a person
- `capture callback`: after hours, queue unavailable, long hold avoidance, caller preference
- `escalate immediately`: emergency language, payment disputes, safety-sensitive requests, or repeated identity ambiguity

Good fallback behavior sounds like this:

- the assistant states whether it is arranging a callback or transferring now
- the assistant repeats the captured callback details before ending
- the system sends one confirmation SMS after the call
- a human follow-up queue or CRM receives the same structured payload

## Minimum Production Guardrails

- Keep the function surface narrow. One callback-capture tool is safer than a general CRM-write catalog.
- Verify webhook signatures and make callback capture idempotent with `call_session_id` or your own dedupe key.
- If the callback number differs from ANI, repeat it back and store both values.
- Put AI disclosure or recording disclosure in the live script when your policy requires it.
- Do not promise response times your staffing model cannot meet.
- Preserve `call_control_id`, `call_session_id`, and `conversation_id` in every CRM or incident record.

## Python Example

```python
import requests

API_KEY = "KEY..."
BASE_URL = "https://api.telnyx.com/v2"
headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

def record_callback_and_confirm(event: dict) -> None:
    arguments = event["data"]["function_call"]["arguments"]
    callback_number = arguments["callback_number"]
    caller_name = arguments["caller_name"]
    reason = arguments["reason"]
    callback_window = arguments["callback_window"]

    dedupe_key = event["data"]["call_session_id"]
    print(f"store callback request {dedupe_key} for {caller_name}")

    requests.post(
        f"{BASE_URL}/messages",
        headers=headers,
        json={
            "from": "+15551234567",
            "to": callback_number,
            "text": (
                f"Acme Plumbing received your callback request about {reason}. "
                f"We will call you back during {callback_window}."
            ),
        },
    ).raise_for_status()
```

## TypeScript Example

```typescript
const API_KEY = process.env.TELNYX_API_KEY!;
const BASE_URL = "https://api.telnyx.com/v2";
const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

type CallbackEvent = {
  data: {
    call_session_id: string;
    function_call: {
      arguments: {
        caller_name: string;
        callback_number: string;
        reason: string;
        callback_window: string;
      };
    };
  };
};

export async function recordCallbackAndConfirm(event: CallbackEvent) {
  const { caller_name, callback_number, reason, callback_window } =
    event.data.function_call.arguments;

  console.log(`store callback request ${event.data.call_session_id} for ${caller_name}`);

  await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: "+15551234567",
      to: callback_number,
      text: `Acme Plumbing received your callback request about ${reason}. We will call you back during ${callback_window}.`,
    }),
  });
}
```
