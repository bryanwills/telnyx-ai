import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "../src/server.js";
import { GOVERNED_COMMUNICATIONS_UI_HTML } from "../src/ui.js";

describe("Governed Communications MCP server", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it("registers the V1 governed communications tool set", () => {
    const server = createServer();
    const tools = (server as unknown as { _registeredTools: Record<string, { annotations?: Record<string, boolean>; _meta?: unknown }> })._registeredTools;

    expect(Object.keys(tools).sort()).toEqual(
      [
        "communications_send_message",
        "communications_start_call",
        "communications_start_verification",
        "communications_get_message_status",
        "communications_get_call_status",
        "communications_get_call_timeline",
        "communications_get_verification_status",
        "communications_list_owned_senders"
      ].sort()
    );
    expect(tools.communications_get_call_status?.annotations?.readOnlyHint).toBe(true);
    expect(tools.communications_send_message?.annotations?.readOnlyHint).toBe(false);
    expect(JSON.stringify(tools.communications_send_message?._meta)).toContain("ui://governed-communications/index.html");
  });

  it("returns a safe auth error when TELNYX_API_KEY is missing", async () => {
    delete process.env.TELNYX_API_KEY;
    const server = createServer();
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: Record<string, unknown>, extra?: unknown) => Promise<unknown> }> })._registeredTools;

    const result = await tools.communications_list_owned_senders.handler({}, {});
    const serialized = JSON.stringify(result);

    expect(serialized).toContain("TELNYX_API_KEY is not set");
    expect(serialized).not.toContain("Authorization");
  });

  it("denies senders outside the allowlist before touching the network", async () => {
    process.env.TELNYX_API_KEY = "test-key";
    process.env.COMMUNICATIONS_ALLOWED_MESSAGE_SENDERS = "+15551230001";
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ data: {} }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const server = createServer();
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: Record<string, unknown>, extra?: unknown) => Promise<unknown> }> })._registeredTools;
    const result = await tools.communications_send_message.handler(
      {
        sender: "+15551239999",
        destination: "+15551235555",
        text: "hello",
        idempotency_key: "idem-1"
      },
      {}
    );
    const payload = JSON.parse(String((result as { content: Array<{ text: string }> }).content[0]?.text));

    expect(payload.error_class).toBe("policy_denied");
    expect(payload.message).toContain("sender");
    expect(fetchCalls).toBe(0);
  });

  it("replays idempotent mutation results and redacts sensitive fields", async () => {
    process.env.TELNYX_API_KEY = "test-key";
    process.env.COMMUNICATIONS_ALLOWED_MESSAGE_SENDERS = "+15551230001";
    process.env.COMMUNICATIONS_ALLOWED_MESSAGING_PROFILES = "profile-1";
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          data: {
            id: "msg_123",
            from: "+15551230001",
            to: "+15551235555",
            text: "secret body",
            media_urls: ["https://cdn.example.test/media.png?token=abc123"]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const server = createServer();
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: Record<string, unknown>, extra?: unknown) => Promise<unknown> }> })._registeredTools;
    const input = {
      sender: "+15551230001",
      destination: "+15551235555",
      text: "secret body",
      messaging_profile_id: "profile-1",
      media_urls: ["https://cdn.example.test/media.png?token=abc123"],
      idempotency_key: "idem-2",
      policy_tag: "operator_outreach"
    };

    const first = await tools.communications_send_message.handler(input, {});
    const second = await tools.communications_send_message.handler(input, {});
    const firstPayload = JSON.parse(String((first as { content: Array<{ text: string }> }).content[0]?.text));
    const secondPayload = JSON.parse(String((second as { content: Array<{ text: string }> }).content[0]?.text));

    expect(firstPayload.outcome.status).toBe("executed");
    expect(secondPayload.outcome.status).toBe("replayed");
    expect(fetchCalls).toBe(1);
    expect(JSON.stringify(firstPayload)).toContain("[redacted-phone]");
    expect(JSON.stringify(firstPayload)).toContain("[redacted-message-body]");
    expect(JSON.stringify(firstPayload)).toContain("[redacted-media-url]");
    expect(JSON.stringify(firstPayload)).not.toContain("15551235555");
    expect(JSON.stringify(firstPayload)).not.toContain("secret body");
    expect(JSON.stringify(firstPayload)).not.toContain("cdn.example.test");
  });

  it("normalizes upstream transient failures for verification start", async () => {
    process.env.TELNYX_API_KEY = "test-key";
    process.env.COMMUNICATIONS_ALLOWED_VERIFY_PROFILES = "verify-profile-1";
    process.env.COMMUNICATIONS_ALLOWED_VERIFY_CHANNELS = "sms";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          errors: [{ title: "Gateway timeout", detail: "https://api.telnyx.com/v2/verifications/sms took too long" }]
        }),
        { status: 504, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const server = createServer();
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: Record<string, unknown>, extra?: unknown) => Promise<unknown> }> })._registeredTools;
    const result = await tools.communications_start_verification.handler(
      {
        destination: "+15551235555",
        channel: "sms",
        verify_profile_id: "verify-profile-1",
        idempotency_key: "idem-3"
      },
      {}
    );
    const payload = JSON.parse(String((result as { content: Array<{ text: string }> }).content[0]?.text));

    expect(payload.error_class).toBe("upstream_transient");
    expect(payload.retriable).toBe(true);
    expect(payload.message).toContain("Gateway timeout");
    expect(payload.message).not.toContain("https://");
  });

  it("exports a self-contained UI summary", () => {
    expect(GOVERNED_COMMUNICATIONS_UI_HTML).toContain("Governed Communications");
    expect(GOVERNED_COMMUNICATIONS_UI_HTML).toContain("communications_send_message");
    expect(GOVERNED_COMMUNICATIONS_UI_HTML).toContain("communications_list_owned_senders");
  });
});
