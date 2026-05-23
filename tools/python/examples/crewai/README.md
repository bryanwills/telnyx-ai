# CrewAI Example

Governed external-agent example using CrewAI with a focused Telnyx MCP App. The crew gets only the tool contract published by the app instead of raw Telnyx write access.

## Setup

```bash
pip install telnyx-agent-toolkit[crewai]
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
2. Wraps the app's published tools as CrewAI `BaseTool` instances.
3. Creates a read-first telecom analyst agent.
4. Runs a task against the governed tool surface and preserves any preview/confirm requirements.
