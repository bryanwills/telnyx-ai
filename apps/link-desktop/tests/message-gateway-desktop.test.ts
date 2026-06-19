import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop exposes Cloud Link Message Gateway connector, IPC API, and ledger UI", async () => {
  const [main, preload, api, app] = await Promise.all([
    readFile("src/main/main.js", "utf8"),
    readFile("src/main/preload.cjs", "utf8"),
    readFile("src/renderer/api.ts", "utf8"),
    readFile("src/renderer/App.tsx", "utf8"),
  ]);

  assert.match(main, /id:\s*"link-message-gateway"[\s\S]*?name:\s*"Cloud Link Message Gateway"/);
  assert.match(main, /secureIpcHandle\("link:message-gateway-send-message"/);
  assert.match(main, /sendGatewayMessage\(input\)/);
  assert.match(main, /MessageGatewayService/);
  assert.match(main, /localMessageGatewayStoragePath/);

  assert.match(preload, /getMessageGatewayReadiness/);
  assert.match(preload, /sendGatewayMessage/);
  assert.match(preload, /listGatewayMessages/);
  assert.match(preload, /listGatewayMessageEvents/);

  assert.match(api, /export interface MessageGatewayMessage/);
  assert.match(api, /sendGatewayMessage\(input:/);
  assert.match(api, /listGatewayMessageEvents\(input: \{ messageId: string \}\)/);

  const navItemsSource = app.slice(app.indexOf("const navItems"), app.indexOf("const viewMeta"));
  assert.doesNotMatch(navItemsSource, /\{ id: "gateway", label: "Gateway", icon: Send \}/);
  assert.match(app, /gateway:\s*\{\s*label:\s*"Gateway",\s*icon:\s*Send\s*\}/);
  assert.match(app, /view === "gateway"/);
  assert.match(app, /function GatewayView/);
  assert.match(app, /linkApi\.sendGatewayMessage/);
  assert.match(app, /linkApi\.listGatewayMessageEvents/);
  assert.match(app, /providerUrl/);
  assert.match(app, />Provider</);
  assert.match(app, /Delivery Ledger/);
});
