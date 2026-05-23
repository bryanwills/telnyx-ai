# OpenAI Example

Governed external-agent example using OpenAI function calling with a focused Telnyx MCP App. By default it targets the read-first `number-intelligence` app instead of exposing raw Telnyx endpoints.

## Setup

```bash
pip install telnyx-agent-toolkit[openai]
export TELNYX_API_KEY=KEY...
export OPENAI_API_KEY=sk-...
export TELNYX_MCP_APPS_BASE_URL=http://localhost:3000
# optional: export TELNYX_MCP_APP_URL=http://localhost:3000/apps/number-intelligence/mcp
# optional: export TELNYX_GOVERNED_APP=number-intelligence
```

## Run

```bash
python main.py
```

## What it does

1. Discovers the governed MCP App over `/apps/{slug}` and initializes an MCP session.
2. Converts the app's published tool schemas into OpenAI function definitions.
3. Sends a read-first telecom question to the model.
4. Executes only the governed tool calls returned by the model.
5. Preserves the MCP App contract for preview/confirm flows instead of inventing raw endpoint behavior.
