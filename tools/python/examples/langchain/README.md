# LangChain Example

Governed external-agent example using LangChain with a focused Telnyx MCP App. It binds the app's published tool contract instead of raw Telnyx endpoint tools.

## Setup

```bash
pip install telnyx-agent-toolkit[langchain] langchain-openai
export TELNYX_API_KEY=KEY...
export OPENAI_API_KEY=sk-...
export TELNYX_MCP_APPS_BASE_URL=http://localhost:3000
```

## Run

```bash
python main.py
```

## What it does

1. Discovers a governed MCP App such as `number-intelligence`.
2. Wraps the app's tool schemas as LangChain tools.
3. Binds those governed tools to a `ChatOpenAI` model.
4. Executes only the MCP App tools returned by the model.
