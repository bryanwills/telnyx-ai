import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import {
  createGovernedCommunicationsService,
  type GovernedCommunicationsService,
  normalizeToolError
} from "./service.js";
import { TelnyxGovernedCommunicationsClient } from "./telnyxClient.js";
import type {
  CallStatusInput,
  CallTimelineInput,
  MessageStatusInput,
  SendMessageInput,
  StartCallInput,
  StartVerificationInput,
  VerificationStatusInput,
  VerifyChannel
} from "./types.js";
import { GOVERNED_COMMUNICATIONS_UI_HTML } from "./ui.js";

const UI_RESOURCE_URI = "ui://governed-communications/index.html";
const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
const MUTATING_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const optionalString = z.string().trim().min(1).optional();

export function createServer(): McpServer {
  const server = new McpServer({
    name: "telnyx-governed-communications",
    version: "0.1.0"
  });
  const idempotencyStore = new Map();

  registerGovernedTool<SendMessageInput>(
    server,
    "communications_send_message",
    "Send governed message",
    "Send SMS or MMS from a pre-approved sender or messaging profile. The server enforces sender allowlists, media count caps, and idempotency replay.",
    {
      sender: z.string().trim().min(1).describe("Approved Telnyx sender phone number."),
      destination: z.string().trim().min(1).describe("Destination phone number."),
      text: z.string().trim().min(1).describe("Message body. Redacted from model-visible output."),
      messaging_profile_id: optionalString.describe("Optional approved Telnyx messaging profile ID."),
      media_urls: z.array(z.string().trim().url()).optional().describe("Optional MMS media URLs, capped server-side."),
      idempotency_key: z.string().trim().min(1).describe("Caller-supplied idempotency key required for mutating tools."),
      policy_tag: optionalString.describe("Intent label for audit and future approval routing.")
    },
    MUTATING_ANNOTATIONS,
    (service, input) => service.sendMessage(input),
    idempotencyStore,
    UI_RESOURCE_URI
  );

  registerGovernedTool<StartCallInput>(
    server,
    "communications_start_call",
    "Start governed outbound call",
    "Initiate an outbound call from an approved source number and approved call-control connection. The current narrow V1 path requires a webhook_url execution target.",
    {
      from: z.string().trim().min(1).describe("Approved Telnyx caller ID."),
      to: z.string().trim().min(1).describe("Destination phone number."),
      connection_id: z.string().trim().min(1).describe("Approved Call Control Application ID."),
      webhook_url: z.string().trim().url().describe("Execution target for the outbound call."),
      timeout_secs: z.number().int().positive().optional().describe("Optional Telnyx timeout in seconds."),
      idempotency_key: z.string().trim().min(1).describe("Caller-supplied idempotency key."),
      policy_tag: optionalString.describe("Intent label for audit and future approval routing.")
    },
    MUTATING_ANNOTATIONS,
    (service, input) => service.startCall(input),
    idempotencyStore
  );

  registerGovernedTool<StartVerificationInput>(
    server,
    "communications_start_verification",
    "Start governed verification",
    "Start a verification flow using an approved verify profile and approved channel. Verification codes are redacted from tool output.",
    {
      destination: z.string().trim().min(1).describe("Destination phone number."),
      channel: z.enum(["sms", "call", "flashcall"] satisfies [VerifyChannel, ...VerifyChannel[]]).describe("Approved verification channel."),
      verify_profile_id: z.string().trim().min(1).describe("Approved Telnyx verify profile ID."),
      timeout_secs: z.number().int().positive().optional().describe("Optional timeout in seconds."),
      locale: optionalString.describe("Optional locale supported by the verify profile."),
      custom_code: optionalString.describe("Optional custom code. Redacted from model-visible output."),
      idempotency_key: z.string().trim().min(1).describe("Caller-supplied idempotency key."),
      policy_tag: optionalString.describe("Intent label for audit and future approval routing.")
    },
    MUTATING_ANNOTATIONS,
    (service, input) => service.startVerification(input),
    idempotencyStore
  );

  registerGovernedTool<MessageStatusInput>(
    server,
    "communications_get_message_status",
    "Get message status",
    "Retrieve one message state and normalized Telnyx delivery summary.",
    {
      message_id: z.string().trim().min(1).describe("Telnyx message ID.")
    },
    READ_ONLY_ANNOTATIONS,
    (service, input) => service.getMessageStatus(input),
    idempotencyStore
  );

  registerGovernedTool<CallStatusInput>(
    server,
    "communications_get_call_status",
    "Get call status",
    "Retrieve one call state and normalized operational identifiers for follow-up.",
    {
      call_control_id: z.string().trim().min(1).describe("Telnyx call_control_id.")
    },
    READ_ONLY_ANNOTATIONS,
    (service, input) => service.getCallStatus(input),
    idempotencyStore
  );

  registerGovernedTool<CallTimelineInput>(
    server,
    "communications_get_call_timeline",
    "Get call timeline",
    "Retrieve a bounded call-events timeline for follow-up investigation. Page size and time window are capped server-side.",
    {
      call_leg_id: optionalString.describe("Optional Telnyx call leg ID."),
      call_session_id: optionalString.describe("Optional Telnyx call session ID."),
      application_session_id: optionalString.describe("Optional Telnyx application session ID."),
      connection_id: optionalString.describe("Optional Call Control Application ID."),
      occurred_at_gte: optionalString.describe("Optional ISO start timestamp."),
      occurred_at_lte: optionalString.describe("Optional ISO end timestamp."),
      page_number: z.number().int().positive().optional().describe("1-based page number."),
      page_size: z.number().int().positive().optional().describe("Requested page size, capped server-side.")
    },
    READ_ONLY_ANNOTATIONS,
    (service, input) => service.getCallTimeline(input),
    idempotencyStore
  );

  registerGovernedTool<VerificationStatusInput>(
    server,
    "communications_get_verification_status",
    "Get verification status",
    "Retrieve a verification lifecycle state and attempt summary.",
    {
      verification_id: z.string().trim().min(1).describe("Telnyx verification ID.")
    },
    READ_ONLY_ANNOTATIONS,
    (service, input) => service.getVerificationStatus(input),
    idempotencyStore
  );

  registerGovernedTool<Record<string, never>>(
    server,
    "communications_list_owned_senders",
    "List allowed senders",
    "Discover the subset of owned numbers, messaging profiles, and call-control connections allowed by this governed app deployment.",
    {},
    READ_ONLY_ANNOTATIONS,
    (service) => service.listOwnedSenders(),
    idempotencyStore,
    UI_RESOURCE_URI
  );

  registerAppResource(
    server,
    "Governed Communications UI",
    UI_RESOURCE_URI,
    {
      description: "Interactive governed communications summary for allowed selectors, bounded mutations, and read-first status follow-up."
    },
    async () => ({
      contents: [
        {
          uri: UI_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: GOVERNED_COMMUNICATIONS_UI_HTML
        }
      ]
    })
  );

  return server;
}

type ToolShape = Record<string, z.ZodTypeAny>;
type ToolInput<T extends ToolShape> = { [K in keyof T]: z.infer<T[K]> };
type AuthBearingExtra = { authInfo?: { token?: string } };

function registerGovernedTool<TInput>(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  inputSchema: ToolShape,
  annotations: Record<string, boolean>,
  run: (service: GovernedCommunicationsService, input: TInput) => Promise<unknown>,
  idempotencyStore: Map<string, { expiresAtMs: number; result: Record<string, unknown> }>,
  uiResourceUri?: string
): void {
  (registerAppTool as unknown as (...args: unknown[]) => void)(
    server,
    name,
    {
      title,
      description,
      inputSchema,
      annotations,
      _meta: { ui: uiResourceUri ? { resourceUri: uiResourceUri } : { visibility: ["app"] } }
    },
    async (input: TInput, extra: AuthBearingExtra) => {
      const service = createLiveService(extra, idempotencyStore);
      if (!service) {
        return errorResult({
          tool_invocation_id: "missing-api-key",
          error_class: "auth",
          retriable: false,
          message: "TELNYX_API_KEY is not set. Provide a restricted Telnyx API key to run governed communications."
        });
      }

      try {
        const result = await run(service, input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>
        };
      } catch (error) {
        const normalized = normalizeToolError(error);
        return errorResult({
          tool_invocation_id: randomUUID(),
          ...normalized
        });
      }
    }
  );
}

function createLiveService(
  extra: AuthBearingExtra | undefined,
  idempotencyStore: Map<string, { expiresAtMs: number; result: Record<string, unknown> }>
): GovernedCommunicationsService | undefined {
  const apiKey = extra?.authInfo?.token ?? process.env.TELNYX_API_KEY;
  if (!apiKey) return undefined;

  const client = new TelnyxGovernedCommunicationsClient({
    apiKey,
    baseUrl: process.env.TELNYX_API_BASE_URL
  });
  return createGovernedCommunicationsService(client, { idempotencyStore });
}

function errorResult(payload: Record<string, unknown>) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload
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
