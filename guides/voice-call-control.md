# Voice Call Control

> Make, manage, and automate voice calls with real-time control — IVR, conferencing, recording, and TTS.

## Prerequisites

- Telnyx API key ([get one free](https://telnyx.com/agent-signup.md))
- A voice connection (Telnyx SIP connection or Call Control application)
- At least one phone number assigned to your connection

## Quick Start

```bash
# Make an outbound call
curl -X POST "https://api.telnyx.com/v2/calls" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15559876543",
    "from": "+15551234567",
    "connection_id": "your-connection-id",
    "webhook_url": "https://your-app.com/webhooks/voice"
  }'
```

## Current Voice Patterns

- Use `transcription_start` with `transcription_engine: "Speechmatics"` and `transcription_model: "speechmatics/standard"` when you need real-time call transcription with interim results.
- Use `answering_machine_detection: "premium_ios_call_screening_detection"` on outbound calls when you need to distinguish a live human from iOS Call Screening or Live Voicemail before connecting an agent or starting a voice AI flow.
- Treat screened-call handling as a webhook-driven state machine. The value is not just the first AMD result, but the follow-up events that tell you when to speak, retry, or abort.
- For voice AI, keep trust controls explicit: identify the caller truthfully, disclose AI or recording when your policy requires it, and do not present screening-aware flows as blanket consent to capture audio.

## API Reference

### Make a Call

**`POST /v2/calls`**

```bash
curl -X POST "https://api.telnyx.com/v2/calls" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15559876543",
    "from": "+15551234567",
    "connection_id": "your-connection-id",
    "webhook_url": "https://your-app.com/webhooks/voice"
  }'
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to` | string | Yes | Destination phone number (E.164 format) |
| `from` | string | Yes | Caller ID (must be a number you own) |
| `connection_id` | string | Yes | Your Call Control connection ID |
| `webhook_url` | string | No | Webhook URL for call control events |

### Hang Up a Call

**`POST /v2/calls/{call_control_id}/actions/hangup`**

```bash
curl -X POST "https://api.telnyx.com/v2/calls/{call_control_id}/actions/hangup" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

### Transfer a Call

**`POST /v2/calls/{call_control_id}/actions/transfer`**

```bash
curl -X POST "https://api.telnyx.com/v2/calls/{call_control_id}/actions/transfer" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to": "+15555555555"}'
```

### Play Audio (TTS)

**`POST /v2/calls/{call_control_id}/actions/speak`**

```bash
curl -X POST "https://api.telnyx.com/v2/calls/{call_control_id}/actions/speak" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": "Your order has been confirmed!",
    "voice": "female",
    "language": "en-US"
  }'
```

### Gather DTMF (IVR)

**`POST /v2/calls/{call_control_id}/actions/gather_using_speak`**

```bash
curl -X POST "https://api.telnyx.com/v2/calls/{call_control_id}/actions/gather_using_speak" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": "Press 1 for sales, 2 for support.",
    "voice": "female",
    "language": "en-US",
    "valid_digits": "12",
    "max_digits": 1
  }'
```

### Record a Call

**`POST /v2/calls/{call_control_id}/actions/record_start`**

```bash
curl -X POST "https://api.telnyx.com/v2/calls/{call_control_id}/actions/record_start" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"format": "wav"}'
```

### Start Real-Time Transcription with Speechmatics

**`POST /v2/calls/{call_control_id}/actions/transcription_start`**

```bash
curl -X POST "https://api.telnyx.com/v2/calls/{call_control_id}/actions/transcription_start" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "transcription_engine": "Speechmatics",
    "transcription_engine_config": {
      "transcription_engine": "Speechmatics",
      "language": "en",
      "transcription_model": "speechmatics/standard",
      "interim_results": true
    }
  }'
```

Speechmatics is available through Telnyx-managed transcription, so you keep the call-control integration and webhook shape you already use while swapping the STT engine and model.

### Outbound Dialing with Premium AMD for iOS Call Screening

**`POST /v2/calls`**

```bash
curl -X POST "https://api.telnyx.com/v2/calls" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15559876543",
    "from": "+15551234567",
    "connection_id": "your-connection-id",
    "webhook_url": "https://your-app.com/webhooks/voice",
    "answering_machine_detection": "premium_ios_call_screening_detection",
    "answering_machine_detection_config": {
      "total_analysis_time_millis": 30000,
      "greeting_duration_millis": 2000,
      "prompt_end_timeout_millis": 30000
    }
  }'
```

Use this mode when your outbound workflow must react differently to:

- a human answering immediately
- a traditional voicemail greeting
- an iOS Call Screening or Live Voicemail prompt

The key webhooks are:

- `call.machine.premium.detection.ended` for the initial Premium AMD classification
- `call.machine.premium.greeting.ended` with `result=prompt_ended` when the iOS screening prompt finishes and your app can respond with who is calling and why
- `call.machine.premium.call_screening.detected` with `result=screening` when Apple call-screening audio is detected
- a second `call.machine.premium.detection.ended` after screening, because Telnyx restarts Premium AMD on the screened call

Recommended outbound AI behavior:

- Place the call with Premium AMD enabled before starting your assistant or bridging to a human queue.
- If Telnyx reports `call.machine.premium.greeting.ended` with `result=prompt_ended`, play a short truthful identification message such as who is calling and why.
- If `call.machine.premium.call_screening.detected` fires, wait for the restarted Premium AMD result instead of speaking over the screening flow.
- Start the assistant only after the restarted AMD cycle indicates a live person, and fall back to your voicemail or retry policy for voicemail outcomes.
- Keep the script factual. Avoid deceptive language such as "we are always listening" or any implication that screened-call audio equals consent for recording.

### Conference Calls

**`POST /v2/conferences`**

```bash
curl -X POST "https://api.telnyx.com/v2/conferences" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "team-meeting"}'
```

## Python Examples

```python
import requests

API_KEY = "KEY..."
BASE_URL = "https://api.telnyx.com/v2"
headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

# Make a call
response = requests.post(
    f"{BASE_URL}/calls",
    headers=headers,
    json={
        "to": "+15559876543",
        "from": "+15551234567",
        "connection_id": "your-connection-id",
        "webhook_url": "https://your-app.com/webhooks/voice"
    }
)
call = response.json()
print(f"Call ID: {call['data']['call_control_id']}")

# Hang up
call_control_id = call['data']['call_control_id']
requests.post(f"{BASE_URL}/calls/{call_control_id}/actions/hangup", headers=headers)
```

## TypeScript Examples

```typescript
const API_KEY = process.env.TELNYX_API_KEY!;
const BASE_URL = "https://api.telnyx.com/v2";
const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// Make a call
const callRes = await fetch(`${BASE_URL}/calls`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    to: "+15559876543",
    from: "+15551234567",
    connection_id: "your-connection-id",
    webhook_url: "https://your-app.com/webhooks/voice",
  }),
});
const { data: call } = await callRes.json();
console.log(`Call ID: ${call.call_control_id}`);

// Speak TTS
await fetch(`${BASE_URL}/calls/${call.call_control_id}/actions/speak`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    payload: "Hello from TypeScript!",
    voice: "female",
    language: "en-US",
  }),
});

// Hang up
await fetch(`${BASE_URL}/calls/${call.call_control_id}/actions/hangup`, {
  method: "POST",
  headers,
});
```

## Agent Toolkit Examples

Use the `telnyx-agent-toolkit` Python package for simplified tool execution:

```python
from telnyx_agent_toolkit import TelnyxToolkit

toolkit = TelnyxToolkit(api_key="KEY...")

# Make an outbound call
call = toolkit.execute("make_call", {
    "to": "+15559876543",
    "from_": "+15551234567",
    "connection_id": "your-connection-id",
    "webhook_url": "https://your-app.com/webhooks/voice"
})
print(f"Call ID: {call['data']['call_control_id']}")

# List voice connections
connections = toolkit.execute("list_connections", {"page_size": 10})
for c in connections["data"]:
    print(f"{c['id']}: {c.get('connection_name')}")
```

## Common Patterns

### Notification Call

```python
def notify_customer(phone: str, message: str):
    # Place the call
    response = requests.post(
        f"{BASE_URL}/calls",
        headers=headers,
        json={
            "to": phone,
            "from": "+15551234567",
            "connection_id": CONNECTION_ID,
            "webhook_url": "https://your-app.com/webhooks/voice"
        }
    )
    call = response.json()
    call_control_id = call["data"]["call_control_id"]
    # Use TTS via the speak action once the call is answered
    # (triggered from your webhook handler on call.answered event)
    return call
```

### IVR Menu

```python
def handle_ivr(call_control_id: str, digits: str):
    routes = {"1": "sales", "2": "support", "0": "operator"}
    if digits in routes:
        requests.post(
            f"{BASE_URL}/calls/{call_control_id}/actions/speak",
            headers=headers,
            json={"payload": f"Transferring to {routes[digits]}...", "voice": "female"}
        )
```

### Reacting to Speechmatics Interim Transcripts

```python
def handle_webhook(event: dict):
    if event["data"]["event_type"] != "call.transcription":
        return

    transcription = event["data"]["payload"]["transcription_data"]
    transcript = transcription["transcript"]

    if not transcription["is_final"]:
        print(f"Partial transcript: {transcript}")
        return

    print(f"Final transcript: {transcript}")
```

### Reacting to iOS Call Screening / Live Voicemail

```python
def handle_amd(event: dict):
    event_type = event["data"]["event_type"]
    payload = event["data"]["payload"]

    if event_type == "call.machine.premium.greeting.ended" and payload["result"] == "prompt_ended":
        # The screening prompt ended without a beep. This is the point where
        # your app can identify the caller and intent for Apple Call Screening.
        requests.post(
            f"{BASE_URL}/calls/{payload['call_control_id']}/actions/speak",
            headers=headers,
            json={"payload": "This is Acme Support calling about your open support request.", "voice": "female"},
        )
        return

    if event_type == "call.machine.premium.call_screening.detected":
        print("Call entered iOS screening flow; wait for the restarted AMD result.")
        return

    if event_type == "call.machine.premium.detection.ended":
        print(f"Premium AMD result: {payload['result']}")
```

## Error Handling

| Error | HTTP Status | Resolution |
|-------|-------------|------------|
| `invalid_phone_number` | 422 | Use E.164 format: `+15551234567` |
| `call_failed` | 400 | Check destination number and routing |
| `insufficient_funds` | 402 | Add funds to account |
| `connection_not_found` | 404 | Verify connection exists |

## Resources

- [Call Control API Reference](https://developers.telnyx.com/docs/api/v2/call-control)
- [Call Control Documentation](https://developers.telnyx.com/docs/voice/call-control)
- [Speech-to-Text with Voice API and TeXML](https://developers.telnyx.com/docs/voice/programmable-voice/speech-to-text)
- [Answering Machine Detection](https://developers.telnyx.com/docs/voice/programmable-voice/answering-machine-detection)
