# AI Voice Assistants

> Deploy AI-powered voice assistants that answer calls with custom personalities and tools.

## Prerequisites

- Telnyx API key ([get one free](https://telnyx.com/agent-signup.md))
- At least one phone number
- AI credits or pay-as-you-go enabled

## Model Selection

- Use `openai/gpt-5.4` when you want the current Telnyx-hosted OpenAI reasoning model for voice assistants.
- Prefer Telnyx-hosted models first for production voice flows. Keeping STT, LLM, TTS, and telephony on the same Telnyx-managed path removes an extra vendor hop and simplifies billing and operations.
- Reach for a custom OpenAI-compatible endpoint only when you have a hard requirement that the hosted model selector does not meet.

## Quick Start

```bash
# Create an assistant
curl -X POST "https://api.telnyx.com/v2/ai/assistants" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Bot",
    "instructions": "You are a helpful customer support assistant. Be friendly and concise.",
    "model": "openai/gpt-5.4",
    "voice": {"provider": "telnyx", "settings": {"voice_id": "en-US-Neural2-F"}}
  }'

# Wire to a phone number (via Call Control application settings in portal)
# Or use the assistant ID in your webhook response
```

## API Reference

### Create Assistant

**`POST /v2/ai/assistants`**

```bash
curl -X POST "https://api.telnyx.com/v2/ai/assistants" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sales Assistant",
    "instructions": "You are a sales representative for Acme Corp. Help customers find the right product. Be enthusiastic but not pushy. Ask qualifying questions about their needs and budget.",
    "voice": {
      "provider": "telnyx",
      "settings": {
        "voice_id": "en-US-Neural2-F",
        "speed": 1.0,
        "pitch": 0
      }
    },
    "model": "openai/gpt-5.4",
    "greeting": "Hello! Thanks for calling Acme Corp. How can I help you today?",
    "hold_music_url": "https://example.com/hold.mp3"
  }'
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Assistant name |
| `instructions` | string | System prompt / personality |
| `voice.provider` | string | `telnyx` or `elevenlabs` |
| `voice.settings.voice_id` | string | Voice identifier |
| `model` | string | LLM model — use `GET /v2/ai/models` or `telnyx ai models` to list available models. Not all inference models work for assistants. |
| `greeting` | string | Initial greeting message |
| `hold_music_url` | string | Music to play on hold |

**Response:**

```json
{
  "id": "assistant-uuid",
  "name": "Sales Assistant",
  "instructions": "...",
  "model": "openai/gpt-5.4",
  "created_at": "2024-01-15T12:00:00Z"
}
```

> **Note:** The AI assistants API returns the object directly — not wrapped in a `"data"` field like other v2 endpoints.

## Hosted Inference Guidance

- `openai/gpt-5.4` is available directly in the assistant model selector and via the Assistants API.
- Telnyx-hosted inference is the default recommendation for real-time voice agents because the LLM stays on the same private Telnyx path as transcription, synthesis, and call media.
- If you need a provider or routing policy outside the hosted catalog, use the custom OpenAI-compatible LLM path deliberately and document the external dependency in your deployment runbook.

## Voice Trust Checklist

Use this checklist for production voice assistants, especially outbound AI or callback flows:

- Use a Telnyx number you control and present a truthful caller identity. Do not imply a bank, carrier, or government caller if the call is actually from your own workflow.
- If your policy or local law requires AI or recording disclosure, put that disclosure in the first turn the callee hears. Do not claim blanket or implied consent in prompts or examples.
- For outbound AI, treat iOS Call Screening and Live Voicemail as a separate branch. Use `answering_machine_detection: "premium_ios_call_screening_detection"` and wait for the screening prompt to finish before identifying the caller or starting the assistant.
- Keep outbound reach narrow with outbound voice profile allowlists such as `whitelisted_destinations`, and review changes to those allowlists like any other fraud-sensitive config change.
- Log webhook outcomes for screening, voicemail, and hangups. On inbound trust-sensitive flows, inspect available caller trust signals such as SHAKEN/STIR attestation before allowing high-risk actions.
- Describe voice-data handling honestly. Avoid claims such as "always listening" unless your product really captures audio continuously and your disclosure, consent, and retention policy all support that behavior.

### List Assistants

**`GET /v2/ai/assistants`**

```bash
curl "https://api.telnyx.com/v2/ai/assistants" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

### Get Assistant

**`GET /v2/ai/assistants/{id}`**

```bash
curl "https://api.telnyx.com/v2/ai/assistants/{assistant_id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

### Update Assistant

**`PATCH /v2/ai/assistants/{id}`**

```bash
curl -X PATCH "https://api.telnyx.com/v2/ai/assistants/{assistant_id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instructions": "Updated instructions here",
    "greeting": "Hi! How can I help?"
  }'
```

### Delete Assistant

**`DELETE /v2/ai/assistants/{id}`**

```bash
curl -X DELETE "https://api.telnyx.com/v2/ai/assistants/{assistant_id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

## Configuring Tools (Function Calling)

Assistants can call tools/functions to perform actions.

```bash
curl -X POST "https://api.telnyx.com/v2/ai/assistants" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Order Assistant",
    "instructions": "Help customers check their order status. Use the check_order tool when they provide an order number.",
    "tools": [{
      "type": "function",
      "function": {
        "name": "check_order",
        "description": "Check the status of an order",
        "parameters": {
          "type": "object",
          "properties": {
            "order_id": {
              "type": "string",
              "description": "The order ID number"
            }
          },
          "required": ["order_id"]
        }
      }
    }]
  }'
```

When the assistant calls a tool, your webhook receives a `function_call` event.

## Knowledge Bases

Add documents the assistant can reference.

```bash
curl -X POST "https://api.telnyx.com/v2/ai/knowledge_bases" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product FAQ",
    "documents": [{
      "title": "Product Specs",
      "content": "Our products are made from..."
    }]
  }'

# Attach to assistant
curl -X PATCH "https://api.telnyx.com/v2/ai/assistants/{id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"knowledge_base_ids": ["kb-uuid"]}'
```

## Conversation History

Assistants maintain conversation context automatically. To view history:

**`GET /v2/ai/conversations`**

```bash
curl "https://api.telnyx.com/v2/ai/conversations?assistant_id={id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

**`GET /v2/ai/conversations/{conversation_id}`**

```bash
curl "https://api.telnyx.com/v2/ai/conversations/{conversation_id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

## Python Examples

```python
import requests

API_KEY = "KEY..."
BASE_URL = "https://api.telnyx.com/v2"
headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

# Create assistant
assistant = requests.post(
    f"{BASE_URL}/ai/assistants",
    headers=headers,
    json={
        "name": "Support Bot",
        "instructions": "You are a helpful customer support agent.",
        "model": "openai/gpt-5.4",
        "voice": {"provider": "telnyx", "settings": {"voice_id": "en-US-Neural2-F"}},
        "greeting": "Hello! How can I help you today?"
    }
).json()
assistant_id = assistant["id"]
print(f"Created: {assistant_id}")

# List assistants
assistants = requests.get(f"{BASE_URL}/ai/assistants", headers=headers).json()
for a in assistants["data"]:
    print(f"{a['id']}: {a['name']}")

# Update
requests.patch(
    f"{BASE_URL}/ai/assistants/{assistant_id}",
    headers=headers,
    json={"greeting": "Hi there! What can I do for you?"}
)

# Delete
requests.delete(f"{BASE_URL}/ai/assistants/{assistant_id}", headers=headers)
```

## TypeScript Examples

```typescript
const API_KEY = process.env.TELNYX_API_KEY!;
const BASE_URL = "https://api.telnyx.com/v2";
const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// Create assistant
const createRes = await fetch(`${BASE_URL}/ai/assistants`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: "Support Bot",
    instructions: "You are a helpful customer support agent.",
    model: "openai/gpt-5.4",
    voice: { provider: "telnyx", settings: { voice_id: "en-US-Neural2-F" } },
    greeting: "Hello! How can I help you today?",
  }),
});
const assistant = await createRes.json();
console.log(`Created: ${assistant.id}`);

// List assistants
const listRes = await fetch(`${BASE_URL}/ai/assistants`, { headers });
const { data: assistants } = await listRes.json();
assistants.forEach((a: any) => console.log(`${a.id}: ${a.name}`));

// Update
await fetch(`${BASE_URL}/ai/assistants/${assistant.id}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ greeting: "Hi there! What can I do for you?" }),
});

// Delete
await fetch(`${BASE_URL}/ai/assistants/${assistant.id}`, {
  method: "DELETE",
  headers,
});
```

## Agent Toolkit Examples

Use the `telnyx-agent-toolkit` Python package for simplified tool execution:

```python
from telnyx_agent_toolkit import TelnyxToolkit

toolkit = TelnyxToolkit(api_key="KEY...")

# Create an AI assistant
assistant = toolkit.execute("create_ai_assistant", {
    "name": "Support Bot",
    "model": "openai/gpt-5.4",
    "instructions": "You are a helpful customer support agent."
})
assistant_id = assistant.get("data", {}).get("id") or assistant["id"]
print(f"Created: {assistant_id}")

# List assistants
assistants = toolkit.execute("list_ai_assistants", {"page_size": 10})
for a in assistants["data"]:
    print(f"{a['id']}: {a['name']}")
```

## Wiring to a Phone Number

1. Create a Call Control application in the portal
2. Set the webhook URL to: `https://api.telnyx.com/v2/ai/assistants/{assistant_id}/answer`
3. Assign your phone number to this application

Or programmatically:

```bash
# Create connection pointing to assistant
curl -X POST "https://api.telnyx.com/v2/connections" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Assistant Connection",
    "active": true,
    "webhook_api_url": "https://api.telnyx.com/v2/ai/assistants/{assistant_id}/answer"
  }'

# Assign phone number to connection
curl -X PATCH "https://api.telnyx.com/v2/phone_numbers/{number_id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"connection_id": "connection-id"}'
```

## Available Voices

**Telnyx voices:**
- `en-US-Neural2-F` (female, US)
- `en-US-Neural2-M` (male, US)
- `en-GB-Neural2-F` (female, UK)
- `en-GB-Neural2-M` (male, UK)

**ElevenLabs:** Provide your API key in voice settings for access to all ElevenLabs voices.

## Operational Notes

- For the lowest-friction deployment path, start with a Telnyx-hosted model such as `openai/gpt-5.4` and a Telnyx-managed voice.
- Keep custom tool calling and knowledge-base attachments inside the assistant configuration where possible before adding an external orchestration layer.
- Re-test latency and turn-taking after every model change. Moving from one hosted model to another is usually low risk; moving to a custom LLM endpoint changes the network path and failure surface.

## Pricing

- **AI model:** Per-token pricing (pricing varies by model)
- **Voice synthesis:** Per-character pricing
- **Phone call:** Standard voice rates

## Error Handling

| Error | HTTP Status | Resolution |
|-------|-------------|------------|
| `insufficient_credits` | 402 | Add AI credits |
| `model_not_available` | 400 | Check model name |
| `voice_not_found` | 400 | Verify voice_id |

## Resources

- [AI Assistants API Reference](https://developers.telnyx.com/docs/api/v2/ai-assistants)
- [AI Assistants Documentation](https://developers.telnyx.com/docs/ai/assistants)
- [Voice Call Control Guide](/guides/voice-call-control.md)
