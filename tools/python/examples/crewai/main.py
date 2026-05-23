"""CrewAI example for governed Telnyx MCP Apps."""

import os
import sys
from pathlib import Path

from crewai import Agent, Crew, Task

sys.path.append(str(Path(__file__).resolve().parents[1]))

from governed_mcp import GovernedMcpAppClient, build_crewai_tools


def main() -> None:
    telnyx_api_key = os.environ["TELNYX_API_KEY"]
    governed_app = os.environ.get("TELNYX_GOVERNED_APP", "number-intelligence")

    mcp_client = GovernedMcpAppClient(
        api_key=telnyx_api_key,
        slug=governed_app,
        client_name="telnyx-governed-crewai-example",
    )
    tools = build_crewai_tools(mcp_client.list_tools(), mcp_client.call_tool)

    telecom_agent = Agent(
        role="Telecom Readiness Analyst",
        goal="Explain telecom readiness using governed, least-privilege Telnyx tools",
        backstory=(
            "You analyze telecom state through read-first or preview-first "
            "governed tools before suggesting any mutating follow-up."
        ),
        tools=tools,
        verbose=True,
    )

    task = Task(
        description=(
            os.environ.get(
                "TELNYX_EXAMPLE_PROMPT",
                "Analyze +14155550123 and recommend the safest next action for onboarding.",
            )
        ),
        expected_output=(
            "A summary of the governed analysis, including any read-first findings "
            "and whether a separate approval-gated action would be needed."
        ),
        agent=telecom_agent,
    )

    crew = Crew(agents=[telecom_agent], tasks=[task], verbose=True)

    try:
        result = crew.kickoff()
        print(f"\nResult: {result}")
    finally:
        mcp_client.close()


if __name__ == "__main__":
    main()
