import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import { createAcpIdentityResolverFromEnvironment } from "./identity.js";
import { loadManifestFromEnvironment } from "./manifest.js";
import { createTableauWidgetService } from "./service.js";
import { createTableauClientFromEnvironment, sanitizeTableauError } from "./tableauClient.js";
import type { TableauWidgetService } from "./service.js";
import { TABLEAU_WIDGETS_UI_HTML } from "./ui.js";

const UI_RESOURCE_URI = "ui://tableau-widgets/index.html";
const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

export function createServer(): McpServer {
  const server = new McpServer({
    name: "telnyx-tableau-widgets",
    version: "0.1.0"
  });

  registerReadTool(
    server,
    "tableau_widgets_catalog",
    "List authorized Tableau widgets",
    "List only Tableau widgets the current signed-in user and squad are entitled to view. Unauthorized widget metadata is filtered before returning.",
    {},
    async (service, _input, token) => service.listAuthorizedCatalog(token),
    UI_RESOURCE_URI
  );

  registerReadTool(
    server,
    "tableau_widget_data",
    "Get Tableau widget data",
    "Return normalized chart rows for one authorized Tableau widget. Denied widgets return a generic access error.",
    {
      widget_id: z.string().min(1).describe("Authorized Tableau widget id from tableau_widgets_catalog.")
    },
    async (service, input, token) => service.getWidgetData(token, input.widget_id)
  );

  registerAppResource(
    server,
    "Tableau Widgets UI",
    UI_RESOURCE_URI,
    {
      description: "Strict-access Tableau widgets app resource for Telnyx Link."
    },
    async () => ({
      contents: [
        {
          uri: UI_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: TABLEAU_WIDGETS_UI_HTML
        }
      ]
    })
  );

  return server;
}

type ToolShape = Record<string, z.ZodTypeAny>;
type ToolInput<T extends ToolShape> = { [K in keyof T]: z.infer<T[K]> };
type AuthBearingExtra = { authInfo?: { token?: string } };

function registerReadTool<T extends ToolShape>(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  inputSchema: T,
  run: (service: TableauWidgetService, input: ToolInput<T>, token: string) => Promise<unknown>,
  uiResourceUri?: string
): void {
  (registerAppTool as unknown as (...args: unknown[]) => void)(
    server,
    name,
    {
      title,
      description,
      inputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: { ui: uiResourceUri ? { resourceUri: uiResourceUri } : { visibility: ["app"] } }
    },
    async (input: ToolInput<T>, extra: AuthBearingExtra) => {
      const token = extra?.authInfo?.token ?? "";
      const service = createLiveService();
      if (!token || !service) return unavailableResult();
      try {
        const result = await run(service, input, token);
        return toolResult(result);
      } catch (error) {
        return safeToolError(error);
      }
    }
  );
}

function createLiveService(): TableauWidgetService | undefined {
  const identityResolver = createAcpIdentityResolverFromEnvironment();
  const tableauClient = createTableauClientFromEnvironment();
  if (!identityResolver || !tableauClient) return undefined;
  return createTableauWidgetService({
    identityResolver,
    tableauClient,
    manifest: loadManifestFromEnvironment(),
    cacheTtlMs: envNumber("TABLEAU_WIDGETS_CACHE_TTL_MS", 5 * 60 * 1000)
  });
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function toolResult(result: unknown): { content: Array<{ type: "text"; text: string }>; structuredContent: Record<string, unknown> } {
  const structuredContent = asStructuredContent(result);
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
}

function asStructuredContent(result: unknown): Record<string, unknown> {
  if (result && typeof result === "object" && !Array.isArray(result)) return result as Record<string, unknown>;
  return { result };
}

function unavailableResult(): { isError: true; content: Array<{ type: "text"; text: string }> } {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: "Tableau widgets are unavailable. Configure ACP identity resolution and server-side Tableau connected-app credentials."
      }
    ]
  };
}

function safeToolError(error: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } {
  return {
    isError: true,
    content: [{ type: "text", text: sanitizeTableauError(error).message }]
  };
}

async function main(): Promise<void> {
  await import("dotenv/config");
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
