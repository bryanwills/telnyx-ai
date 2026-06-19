# CrewAI Example

Telecom provisioning crew using CrewAI with Telnyx tools.

## Setup

```bash
# Install a security-reviewed CrewAI distribution separately first.
pip install telnyx-agent-toolkit
export TELNYX_API_KEY=KEY...
export OPENAI_API_KEY=sk-...
```

## Run

```bash
python main.py
```

## What it does

1. Creates a Telnyx toolkit with messaging, numbers, and balance permissions
2. Wraps tools as CrewAI `BaseTool` instances
3. Creates a "Telecom Provisioning Specialist" agent
4. Runs a task to check balance and search for phone numbers
