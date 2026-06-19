import test from "node:test";
import assert from "node:assert/strict";
import {
  CloudLinkSessionService,
  createCloudLinkSessionServer,
  listenCloudLinkSessionServer,
  TelnyxHostedSessionRunner,
  type CloudLinkSessionRunner,
  type CloudLinkSessionRunnerInputRequest,
  type CloudLinkSessionRunnerStartRequest,
  type CloudLinkSessionRunnerStopRequest,
  type CloudLinkSmsNotificationAdapter,
  type CloudLinkSmsNotificationRequest,
  type CloudLinkSmsNotificationResult,
} from "../src/session-daemon.js";

class CapturingRunner implements CloudLinkSessionRunner {
  readonly mode = "test-runner";
  readonly starts: CloudLinkSessionRunnerStartRequest[] = [];
  readonly inputs: CloudLinkSessionRunnerInputRequest[] = [];
  readonly stops: CloudLinkSessionRunnerStopRequest[] = [];

  async start(request: CloudLinkSessionRunnerStartRequest) {
    this.starts.push(request);
    return {
      externalId: `runner-${request.session.id}`,
      attachUrl: `https://sessions.telnyx.test/${request.session.id}`,
      output: "runner started\n",
      lifecycle: "running" as const,
      agentState: request.session.command ? "working" as const : "idle" as const,
    };
  }

  async sendInput(request: CloudLinkSessionRunnerInputRequest) {
    this.inputs.push(request);
    return {
      output: `runner input: ${request.text}\n`,
      lifecycle: "running" as const,
      agentState: "working" as const,
    };
  }

  async stop(request: CloudLinkSessionRunnerStopRequest) {
    this.stops.push(request);
    return {
      output: "runner stopped\n",
      lifecycle: "stopped" as const,
      agentState: "done" as const,
    };
  }
}

class CapturingSmsAdapter implements CloudLinkSmsNotificationAdapter {
  readonly mode = "test-sms";
  readonly sent: CloudLinkSmsNotificationRequest[] = [];

  async sendSms(request: CloudLinkSmsNotificationRequest): Promise<CloudLinkSmsNotificationResult> {
    this.sent.push(request);
    return { externalId: `sms-${this.sent.length}` };
  }
}

function serviceFixture() {
  let nextId = 0;
  const runner = new CapturingRunner();
  const sms = new CapturingSmsAdapter();
  const service = new CloudLinkSessionService({
    runner,
    smsAdapter: sms,
    idGenerator: () => `test-${++nextId}`,
    now: () => new Date("2026-06-19T10:00:00.000Z"),
  });
  return { service, runner, sms };
}

test("CloudLinkSessionService starts a server-owned session and sends blocked SMS with the user's Telnyx API key", async () => {
  const { service, runner, sms } = serviceFixture();
  const session = await service.createSession({
    title: "Carrier fix",
    cwd: "/repo",
    command: "codex run",
    idempotency_key: "carrier-fix",
    notifications: {
      sms: {
        enabled: true,
        to: "+14155550100",
        from: "+14155550101",
      },
      mobileUrl: "https://link.telnyx.test/sessions/carrier-fix",
    },
  }, {
    actor: "owner@telnyx.com",
    telnyxApiKey: "KEY-user",
  });

  assert.equal(session.lifecycle, "running");
  assert.equal(session.agentState, "working");
  assert.equal(session.runner.mode, "test-runner");
  assert.equal(runner.starts.length, 1);
  assert.equal(sms.sent.length, 0);

  const blocked = await service.updateAgentState(session.id, {
    state: "blocked",
    detail: "Agent needs approval for a write command.",
  }, {
    actor: "owner@telnyx.com",
    telnyxApiKey: "KEY-user",
  });

  assert.equal(blocked.agentState, "blocked");
  assert.equal(sms.sent.length, 1);
  assert.equal(sms.sent[0]?.apiKey, "KEY-user");
  assert.equal(sms.sent[0]?.to, "+14155550100");
  assert.match(sms.sent[0]?.text ?? "", /needs approval/);
  assert.equal(service.listEvents(session.id).some((event) => event.type === "notification.sms_sent"), true);
});

test("CloudLinkSessionService idempotency prevents duplicate runner starts", async () => {
  const { service, runner } = serviceFixture();
  const first = await service.createSession({
    title: "Idempotent",
    idempotency_key: "same-key",
  }, { actor: "owner@telnyx.com" });
  const second = await service.createSession({
    title: "Idempotent retry",
    idempotency_key: "same-key",
  }, { actor: "owner@telnyx.com" });

  assert.equal(first.id, second.id);
  assert.equal(runner.starts.length, 1);
  assert.equal(service.listEvents(first.id).some((event) => event.type === "session.idempotent_replay"), true);
});

test("CloudLinkSessionService requires explicit attach approval and records audit events", async () => {
  const { service } = serviceFixture();
  const session = await service.createSession({
    title: "Mobile attach",
    idempotency_key: "mobile-attach",
  }, { actor: "owner@telnyx.com" });
  const attachRequest = service.requestAttach(session.id, {
    clientLabel: "Pete's phone",
    clientKind: "mobile",
  }, { actor: "owner@telnyx.com" });

  assert.equal(attachRequest.status, "pending");
  assert.equal(attachRequest.clientKind, "mobile");

  const approved = service.approveAttach(session.id, attachRequest.id, {
    reason: "Owner approved phone attach.",
  }, { actor: "owner@telnyx.com" });

  assert.equal(approved.status, "approved");
  const events = service.listEvents(session.id).map((event) => event.type);
  assert.deepEqual(events.filter((type) => type.startsWith("attach.")), ["attach.requested", "attach.approved"]);
});

test("Cloud Link Session Daemon HTTP API enforces auth context and exposes session state", async () => {
  const { service, sms } = serviceFixture();
  const server = createCloudLinkSessionServer(service, { requireAuth: true, requireAuthContext: true });
  const listener = await listenCloudLinkSessionServer(server);
  try {
    const missingContext = await fetch(`${listener.url}/sessions`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: "No context", idempotency_key: "missing-context" }),
    });
    assert.equal(missingContext.status, 401);

    const accepted = await fetch(`${listener.url}/sessions`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "x-telnyx-api-key": "KEY-user",
        "x-telnyx-actor": "owner@telnyx.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "HTTP session",
        idempotency_key: "http-session",
        notifications: { sms: { enabled: true, to: "+14155550100", from: "+14155550101" } },
      }),
    });
    assert.equal(accepted.status, 202);
    const acceptedPayload = await accepted.json() as { session: { id: string } };

    const done = await fetch(`${listener.url}/sessions/${encodeURIComponent(acceptedPayload.session.id)}/state`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "x-telnyx-api-key": "KEY-user",
        "x-telnyx-actor": "owner@telnyx.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({ state: "done", detail: "Finished from HTTP." }),
    });
    assert.equal(done.status, 202);
    assert.equal(sms.sent.length, 1);

    const listed = await fetch(`${listener.url}/sessions`, {
      headers: {
        authorization: "Bearer token",
        "x-telnyx-actor": "owner@telnyx.com",
      },
    });
    const listedPayload = await listed.json() as { sessions: Array<{ id: string; agentState: string }> };
    assert.deepEqual(listedPayload.sessions.map((item) => [item.id, item.agentState]), [[acceptedPayload.session.id, "done"]]);
  } finally {
    await listener.close();
  }
});

test("TelnyxHostedSessionRunner proxies lifecycle requests to a hosted PTY runner", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const runner = new TelnyxHostedSessionRunner({
    runnerUrl: "https://runner.telnyx.test",
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        id: "remote-1",
        output: "remote ok\n",
        lifecycle: "running",
        agent_state: "working",
        attach_url: "https://runner.telnyx.test/attach/remote-1",
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const { service } = serviceFixture();
  const session = await service.createSession({ title: "Proxy", idempotency_key: "proxy" }, { actor: "owner@telnyx.com" });

  await runner.start({ session, context: { actor: "owner@telnyx.com", bearerToken: "rev2", telnyxApiKey: "KEY-user" } });
  await runner.sendInput({ session: { ...session, runner: { ...session.runner, externalId: "remote-1" } }, text: "status", context: { actor: "owner@telnyx.com", bearerToken: "rev2" } });
  await runner.stop({ session: { ...session, runner: { ...session.runner, externalId: "remote-1" } }, context: { actor: "owner@telnyx.com", bearerToken: "rev2" } });

  assert.deepEqual(calls.map((call) => call.url), [
    "https://runner.telnyx.test/sessions",
    "https://runner.telnyx.test/sessions/remote-1/input",
    "https://runner.telnyx.test/sessions/remote-1/stop",
  ]);
  assert.equal((calls[0]?.init.headers as Record<string, string>).authorization, "Bearer rev2");
  assert.equal((calls[0]?.init.headers as Record<string, string>)["x-telnyx-api-key"], "KEY-user");
});
