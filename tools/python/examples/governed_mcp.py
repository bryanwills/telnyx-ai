"""Helpers for governed Telnyx MCP App examples.

These examples discover a focused MCP App first, then use only the tools that
app publishes. That keeps framework examples aligned with the governed
read-first/preview-first surface instead of exposing raw Telnyx endpoints.
"""

from __future__ import annotations

import json
import os
from typing import Any, Callable, Type
from uuid import uuid4

import httpx
from pydantic import BaseModel, Field, create_model

ToolDefinition = dict[str, Any]


class GovernedMcpAppClient:
    """Minimal MCP Apps HTTP client for examples."""

    def __init__(
        self,
        *,
        api_key: str,
        slug: str,
        client_name: str,
        mcp_app_url: str | None = None,
        mcp_apps_base_url: str | None = None,
    ) -> None:
        self._api_key = api_key
        self._slug = slug
        self._client_name = client_name
        self._mcp_app_url = mcp_app_url or os.environ.get("TELNYX_MCP_APP_URL")
        self._mcp_apps_base_url = (
            mcp_apps_base_url
            or os.environ.get("TELNYX_MCP_APPS_BASE_URL")
            or "http://localhost:3000"
        ).rstrip("/")
        self._session_id: str | None = None
        self._mcp_url: str | None = None
        self._http = httpx.Client(timeout=30.0)

    def close(self) -> None:
        self._http.close()

    def list_tools(self) -> list[ToolDefinition]:
        response = self._rpc("tools/list")
        return response["tools"]

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        return self._rpc("tools/call", {"name": name, "arguments": arguments})

    def _rpc(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._ensure_initialized()
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": str(uuid4()),
            "method": method,
        }
        if params is not None:
            payload["params"] = params
        response = self._http.post(self._mcp_url, headers=self._headers(), json=payload)
        response.raise_for_status()
        data = response.json()
        if "error" in data:
            raise RuntimeError(f"MCP error calling {method}: {data['error']}")
        return data["result"]

    def _ensure_initialized(self) -> None:
        if self._session_id:
            return

        if not self._mcp_url:
            if self._mcp_app_url:
                self._mcp_url = self._mcp_app_url
            else:
                discovery = self._http.get(
                    f"{self._mcp_apps_base_url}/apps/{self._slug}",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                discovery.raise_for_status()
                self._mcp_url = discovery.json()["app"]["mcp_url"]

        initialize = self._http.post(
            self._mcp_url,
            headers=self._headers(),
            json={
                "jsonrpc": "2.0",
                "id": str(uuid4()),
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": self._client_name, "version": "0.1.0"},
                },
            },
        )
        initialize.raise_for_status()
        self._session_id = initialize.headers.get("Mcp-Session-Id")
        init_data = initialize.json()
        if "error" in init_data:
            raise RuntimeError(f"MCP initialize failed: {init_data['error']}")

        self._http.post(
            self._mcp_url,
            headers=self._headers(),
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        ).raise_for_status()

    def _headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        return headers


def build_openai_tools(tool_definitions: list[ToolDefinition]) -> list[dict[str, Any]]:
    """Convert MCP tool metadata into OpenAI function definitions."""
    tools: list[dict[str, Any]] = []
    for tool in tool_definitions:
        schema = _clean_schema(tool.get("inputSchema", {"type": "object", "properties": {}}))
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": schema,
                },
            }
        )
    return tools


def build_langchain_tools(
    tool_definitions: list[ToolDefinition], executor: Callable[[str, dict[str, Any]], dict[str, Any]]
) -> list[Any]:
    """Wrap MCP tools as LangChain BaseTool instances."""
    from langchain_core.tools import BaseTool

    result: list[Any] = []
    for tool in tool_definitions:
        args_schema = _build_args_schema(tool)
        result.append(_make_langchain_tool(BaseTool, executor, tool["name"], tool.get("description", ""), args_schema))

    return result


def build_crewai_tools(
    tool_definitions: list[ToolDefinition], executor: Callable[[str, dict[str, Any]], dict[str, Any]]
) -> list[Any]:
    """Wrap MCP tools as CrewAI BaseTool instances."""
    from crewai.tools import BaseTool

    result: list[Any] = []
    for tool in tool_definitions:
        args_schema = _build_args_schema(tool)
        result.append(_make_crewai_tool(BaseTool, executor, tool["name"], tool.get("description", ""), args_schema))

    return result


def mcp_result_to_text(result: dict[str, Any]) -> str:
    """Normalize MCP tool results for LLM message/tool output."""
    if "structuredContent" in result:
        return json.dumps(result["structuredContent"], indent=2)

    content = result.get("content", [])
    text_parts = [item.get("text", "") for item in content if item.get("type") == "text"]
    if text_parts:
        return "\n\n".join(part for part in text_parts if part)

    return json.dumps(result, indent=2)


def _clean_schema(schema: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(schema)
    properties = cleaned.get("properties", {})
    cleaned["properties"] = {
        name: {key: value for key, value in prop.items() if key != "default"}
        for name, prop in properties.items()
    }
    return cleaned


def _build_args_schema(tool_def: ToolDefinition) -> Type[BaseModel]:
    schema = tool_def.get("inputSchema", {"type": "object", "properties": {}})
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))

    fields: dict[str, Any] = {}
    for prop_name, prop_schema in properties.items():
        py_type, field = _json_schema_to_field(prop_schema, prop_name in required)
        fields[prop_name] = (py_type, field)

    model_name = f"{tool_def['name'].title().replace('_', '')}Input"
    return create_model(model_name, **fields)  # type: ignore[call-overload]


def _make_langchain_tool(
    base_tool: Any,
    executor: Callable[[str, dict[str, Any]], dict[str, Any]],
    tool_name: str,
    tool_description: str,
    tool_args_schema: Type[BaseModel],
) -> Any:
    class GovernedTool(base_tool):
        name: str = tool_name
        description: str = tool_description
        args_schema: Any = tool_args_schema

        def _run(self, **kwargs: Any) -> str:
            return mcp_result_to_text(executor(tool_name, kwargs))

        async def _arun(self, **kwargs: Any) -> str:
            return self._run(**kwargs)

    GovernedTool.__name__ = f"Governed{tool_name.title().replace('_', '')}Tool"
    return GovernedTool()


def _make_crewai_tool(
    base_tool: Any,
    executor: Callable[[str, dict[str, Any]], dict[str, Any]],
    tool_name: str,
    tool_description: str,
    tool_args_schema: Type[BaseModel],
) -> Any:
    def _run(self: Any, **kwargs: Any) -> str:
        return mcp_result_to_text(executor(tool_name, kwargs))

    tool_cls = type(
        f"Governed{tool_name.title().replace('_', '')}Tool",
        (base_tool,),
        {
            "name": tool_name,
            "description": tool_description,
            "args_schema": tool_args_schema,
            "_run": _run,
        },
    )
    return tool_cls()


def _json_schema_to_field(schema: dict[str, Any], required: bool) -> tuple[Any, Any]:
    type_map: dict[str, type] = {
        "string": str,
        "integer": int,
        "number": float,
        "boolean": bool,
    }

    schema_type = schema.get("type", "string")
    if isinstance(schema_type, list):
        py_type: Any = str
    elif schema_type == "array":
        item_type = schema.get("items", {}).get("type", "string")
        inner = type_map.get(item_type, str)
        py_type = list[inner]  # type: ignore[valid-type]
    elif schema_type == "object":
        py_type = dict[str, Any]
    else:
        py_type = type_map.get(schema_type, str)

    description = schema.get("description", "")
    if required:
        return py_type, Field(description=description)

    return py_type | None, Field(default=None, description=description)  # type: ignore[operator]
