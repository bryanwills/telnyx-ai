# CrewAI OpenAI-compatible Example

Use CrewAI with the Telnyx Inference API as an OpenAI-compatible LLM backend.

## Setup

```bash
pip install crewai openai python-dotenv
export TELNYX_API_KEY=KEY...
```

## Run

```bash
python main.py
```

## What it does

1. Configures a CrewAI `LLM` with the Telnyx Inference API base URL
2. Uses `TELNYX_API_KEY` for authentication
3. Runs a single CrewAI agent and task using a Telnyx-hosted model
4. Demonstrates the minimal OpenAI-compatible integration path for CrewAI

## Notes

- This example is intentionally minimal. It validates the LLM backend path first.
- It does not expose secrets, hard-code API keys, or depend on LiteLLM.
- Future follow-up can add a richer example, tool-calling validation, and docs in the main toolkit README.
