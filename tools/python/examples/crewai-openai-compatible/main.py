"""CrewAI + Telnyx OpenAI-compatible example — research crew.

This example configures CrewAI to use the Telnyx Inference API as an
OpenAI-compatible LLM backend.

Requirements:
    pip install crewai openai python-dotenv

Usage:
    export TELNYX_API_KEY=KEY...
    python main.py
"""

from __future__ import annotations

import os

from crewai import Agent, Crew, LLM, Task

TELNYX_BASE_URL = "https://api.telnyx.com/v2/ai"
DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct"


def build_llm() -> LLM:
    """Create a CrewAI LLM configured for the Telnyx Inference API."""
    return LLM(
        model=DEFAULT_MODEL,
        api_key=os.environ["TELNYX_API_KEY"],
        base_url=TELNYX_BASE_URL,
        temperature=0.2,
    )


def main() -> None:
    llm = build_llm()

    researcher = Agent(
        role="Telecom market researcher",
        goal="Summarize how telecom APIs can help AI agents interact with the real world",
        backstory=(
            "You help product and developer teams understand how telecom capabilities "
            "fit into modern AI agent workflows."
        ),
        llm=llm,
        verbose=True,
    )

    task = Task(
        description=(
            "Give a concise explanation of how telecom capabilities such as SMS, voice, "
            "number lookup, and verification can extend an AI agent platform. "
            "Keep it to 4 bullet points."
        ),
        expected_output="Four concise bullet points in plain English.",
        agent=researcher,
    )

    crew = Crew(
        agents=[researcher],
        tasks=[task],
        verbose=True,
    )

    result = crew.kickoff()
    print(f"\nResult:\n{result}")


if __name__ == "__main__":
    main()
