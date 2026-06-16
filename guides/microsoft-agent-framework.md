# Microsoft Agent Framework

> Use Telnyx as an OpenAI-compatible inference provider for Microsoft Agent Framework (formerly AutoGen).

## Prerequisites

- Python 3.10+
- Telnyx API key ([get one free](https://telnyx.com))
- `agent-framework` and `agent-framework-openai` packages

## Quick Start

```bash
# Install dependencies
pip install agent-framework agent-framework-openai python-dotenv

# Set environment variables
export TELNYX_API_KEY=your_api_key_here
export TELNYX_MODEL=moonshotai/Kimi-K2.6
```

Send your first chat completion using Telnyx as the inference backend:

```bash
curl -X POST "https://api.telnyx.com/v2/ai/openai/chat/completions" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "moonshotai/Kimi-K2.6",
    "messages": [{"role": "user", "content": "Hello, how are you?"}]
  }'
```

Generate embeddings:

```bash
curl -X POST "https://api.telnyx.com/v2/ai/openai/embeddings" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "thenlper/gte-large",
    "input": "Telnyx provides telecom infrastructure for AI agents."
  }'
```

## API Reference

Telnyx provides an OpenAI-compatible API at `https://api.telnyx.com/v2/ai/openai` that supports chat completions, embeddings, and function/tool calling. No custom provider package is needed. For Agent Framework, use `OpenAIChatCompletionClient` for chat requests because Telnyx exposes the Chat Completions surface.

### Chat Completions

**`POST /v2/ai/openai/chat/completions`**

```bash
curl -X POST "https://api.telnyx.com/v2/ai/openai/chat/completions" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "moonshotai/Kimi-K2.6",
    "messages": [{"role": "user", "content": "What is the capital of France?"}],
    "stream": false
  }'
```

### Embeddings

**`POST /v2/ai/openai/embeddings`**

```bash
curl -X POST "https://api.telnyx.com/v2/ai/openai/embeddings" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "thenlper/gte-large",
    "input": ["First text", "Second text"]
  }'
```

## Python Examples

### Chat Completion

```python
import asyncio
import os

from agent_framework import Agent
from agent_framework.openai import OpenAIChatCompletionClient
from dotenv import load_dotenv

load_dotenv()

async def main() -> None:
    client = OpenAIChatCompletionClient(
        api_key=os.getenv("TELNYX_API_KEY"),
        base_url="https://api.telnyx.com/v2/ai/openai",
        model=os.getenv("TELNYX_MODEL", "moonshotai/Kimi-K2.6"),
    )

    agent = Agent(
        client=client,
        name="TelnyxAgent",
        instructions="You are a helpful assistant.",
    )

    # Non-streaming
    result = await agent.run("What is the capital of France?")
    print(result)

    # Streaming
    async for chunk in agent.run("Explain quantum computing.", stream=True):
        if chunk.text:
            print(chunk.text, end="", flush=True)

asyncio.run(main())
```

### Embeddings

```python
import asyncio
import os

from agent_framework.openai import OpenAIEmbeddingClient
from dotenv import load_dotenv

load_dotenv()

async def main() -> None:
    client = OpenAIEmbeddingClient(
        api_key=os.getenv("TELNYX_API_KEY"),
        base_url="https://api.telnyx.com/v2/ai/openai",
        model=os.getenv("TELNYX_EMBEDDING_MODEL", "thenlper/gte-large"),
    )

    texts = [
        "Telnyx provides telecom infrastructure for AI agents.",
        "Agent Framework makes it easy to build AI agents.",
    ]

    response = await client.get_embeddings(texts)

    for i, embedding in enumerate(response):
        print(f"Text {i + 1}: \"{texts[i]}\"")
        print(f"  Dimensions: {embedding.dimensions}")
        print(f"  Preview: [{', '.join(str(v) for v in embedding.vector[:5])}, ...]")

asyncio.run(main())
```

## TypeScript Examples

If you want to hit the same Telnyx endpoint from TypeScript, you can use the OpenAI SDK directly:

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.TELNYX_API_KEY,
  baseURL: "https://api.telnyx.com/v2/ai/openai",
});

async function main() {
  const response = await client.chat.completions.create({
    model: process.env.TELNYX_MODEL || "moonshotai/Kimi-K2.6",
    messages: [{ role: "user", content: "What is the capital of France?" }],
  });

  console.log(response.choices[0]?.message?.content);

  const stream = await client.chat.completions.create({
    model: process.env.TELNYX_MODEL || "moonshotai/Kimi-K2.6",
    messages: [{ role: "user", content: "Explain quantum computing." }],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
}

main();
```

## Available Models

| Model | Type | Description |
|-------|------|-------------|
| `moonshotai/Kimi-K2.6` | Chat | General-purpose LLM (recommended) |
| `moonshotai/Kimi-K2.5` | Chat | Previous generation |
| `zai-org/GLM-5.1-FP8` | Chat | Zhipu AI reasoning model |
| `MiniMaxAI/MiniMax-M2.7` | Chat | MiniMax model |
| `Qwen/Qwen3-235B-A22B` | Chat | Alibaba Qwen3 model |
| `openai/gpt-4o` | Chat | OpenAI GPT-4o |
| `openai/gpt-5` | Chat | OpenAI GPT-5 |
| `thenlper/gte-large` | Embeddings | 1024-dim text embeddings |

> See the [full model list](https://developers.telnyx.com/docs/inference) for all available models.

## Telecom Tools (Coming Soon)

Telnyx provides FunctionTools for agent frameworks that give your agents telecom capabilities:

- **SMS**: Send text messages
- **Number Lookup**: Carrier and line-type identification
- **Phone Verification**: OTP verification via SMS or voice

## Resources

- [Microsoft Agent Framework](https://github.com/microsoft/agent-framework)
- [Telnyx AI API](https://developers.telnyx.com/api/inference/inference-embedding/create-embedding)
- [OpenAI API Migration Guide](https://developers.telnyx.com/docs/inference/openai)
