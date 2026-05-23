"""LangChain example for governed Telnyx MCP Apps."""

import os
import sys
from pathlib import Path

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

sys.path.append(str(Path(__file__).resolve().parents[1]))

from governed_mcp import GovernedMcpAppClient, build_langchain_tools


def main() -> None:
    telnyx_api_key = os.environ["TELNYX_API_KEY"]
    governed_app = os.environ.get("TELNYX_GOVERNED_APP", "number-intelligence")

    mcp_client = GovernedMcpAppClient(
        api_key=telnyx_api_key,
        slug=governed_app,
        client_name="telnyx-governed-langchain-example",
    )
    tools = build_langchain_tools(mcp_client.list_tools(), mcp_client.call_tool)
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    llm_with_tools = llm.bind_tools(tools)

    messages = [
        HumanMessage(
            content=os.environ.get(
                "TELNYX_EXAMPLE_PROMPT",
                "Analyze +14155550123 and summarize the safest next step for messaging setup.",
            )
        )
    ]

    try:
        print(f"Sending request to LangChain with governed app '{governed_app}'...")
        response = llm_with_tools.invoke(messages)
        print(f"\nResponse: {response.content}")

        if hasattr(response, "tool_calls") and response.tool_calls:
            for tc in response.tool_calls:
                print(f"\nGoverned tool call: {tc['name']}")
                print(f"  Args: {tc['args']}")

                for tool in tools:
                    if tool.name == tc["name"]:
                        result = tool.invoke(tc["args"])
                        print(f"  Result: {result[:400]}...")
    finally:
        mcp_client.close()


if __name__ == "__main__":
    main()
