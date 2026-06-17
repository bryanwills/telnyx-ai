import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, chromium, type Browser, type ElectronApplication, type Page } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");
const targetNumber = process.env.LINK_DESKTOP_LIVE_CALL_TARGET || "+14158663106";
const previewCallerNumber = "+14155550100";

test("mocked E2E places the target call through the merged dialer builder", async () => {
  const port = await freePort();
  const preview = await startPreview(port);
  const browser = await launchChromium();

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      const call = await placeMockedCall(page, `http://127.0.0.1:${port}/?previewAuth=ready&phoneE2E=ready`);
      assert.equal(call.destinationNumber, targetNumber);
      assert.equal(call.callerNumber, previewCallerNumber);
      assert.equal(call.audio, true);
      assert.equal(call.remoteElement, "link-phone-remote-audio");
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
    stopPreview(preview);
  }
});

test("live E2E places one real target call from the Electron softphone", { skip: liveSkipReason() }, async () => {
  assert.equal(
    process.env.LINK_DESKTOP_LIVE_CALL_CONFIRM,
    targetNumber,
    `Refusing to place a real call unless LINK_DESKTOP_LIVE_CALL_CONFIRM=${targetNumber}.`,
  );

  const app = await _electron.launch({
    args: [
      path.join(appRoot, "src/main/main.js"),
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
    cwd: appRoot,
    env: {
      ...process.env,
      LINK_DESKTOP_RENDERER: "dist/renderer/index.html",
      TELNYX_AUTH_REV2: process.env.TELNYX_AUTH_REV2 || "link-live-call-e2e",
    },
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await openAssistantPhone(page);
    await assertPreCallModules(page);
    await dialAndClickCall(page, targetNumber);
    await page.waitForFunction(() => {
      return Boolean(document.querySelector(".linkSoftphoneActions") || document.querySelector(".linkSoftphoneAgentInvite"));
    }, undefined, { timeout: 20_000 });
    await assertInCallModules(page);

    await page.waitForTimeout(Number(process.env.LINK_DESKTOP_LIVE_CALL_SECONDS || 5) * 1000);
    await hangUpIfPossible(page);
    await assertPostCallModules(page);
    await page.waitForTimeout(1750);
  } finally {
    await closeElectron(app);
  }
});

async function placeMockedCall(page: Page, url: string) {
  await page.goto(url, { waitUntil: "networkidle" });
  await openAssistantPhone(page);
  await assertPreCallModules(page);
  await dialAndClickCall(page, targetNumber);
  await page.waitForFunction(() => {
    const state = (window as typeof window & { __linkPhoneE2E?: { calls?: Array<Record<string, unknown>> } }).__linkPhoneE2E;
    return Boolean(state?.calls?.some((call) => call.type === "newCall"));
  });
  await assertInCallModules(page);
  const call = await page.evaluate(() => {
    const state = (window as typeof window & { __linkPhoneE2E?: { calls?: Array<Record<string, unknown>> } }).__linkPhoneE2E;
    return state?.calls?.find((call) => call.type === "newCall") ?? {};
  });
  await hangUpIfPossible(page);
  await assertPostCallModules(page);
  return call;
}

async function openAssistantPhone(page: Page) {
  await page.getByLabel("Assistant").getByRole("button", { name: /Call|Phone/ }).click();
  await page.locator(".linkSoftphone").waitFor({ state: "visible" });
  await page.waitForSelector("#link-phone-remote-audio", { state: "attached" });
}

async function dialAndClickCall(page: Page, destination: string) {
  const input = page.locator(".linkSoftphoneDialInput input");
  await input.fill(destination);
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>(".linkSoftphoneCallButton");
    return Boolean(button && !button.disabled);
  }, undefined, { timeout: 15_000 });
  await page.locator(".linkSoftphoneCallButton").click();
}

async function hangUpIfPossible(page: Page) {
  const endButton = page.locator(".linkSoftphoneAction.end").first();
  try {
    await endButton.waitFor({ state: "visible", timeout: 5_000 });
    await endButton.click();
  } catch {
    return;
  }
}

async function assertPreCallModules(page: Page) {
  const softphone = page.locator(".linkSoftphone");
  await softphone.locator(".linkSoftphoneSearchCard").waitFor({ state: "visible", timeout: 10_000 });
  await softphone.locator(".linkSoftphoneCallerIdBar").waitFor({ state: "visible", timeout: 10_000 });
  await assertSidebarModules(page, ["Contact Preview"]);
}

async function assertInCallModules(page: Page) {
  await assertSidebarModules(page, ["Live Transcription", "Call Recording"]);
  await page.locator(".linkSoftphoneCallTimer").waitFor({ state: "visible", timeout: 10_000 });
}

async function assertPostCallModules(page: Page) {
  await assertSidebarModules(page, ["Call Notes", "Salesforce Notes Sync", "Dispositions", "Call Analytics"]);
}

async function assertSidebarModules(page: Page, moduleNames: string[]) {
  const softphone = page.locator(".linkSoftphone");
  for (const name of moduleNames) {
    await softphone.getByText(name, { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  }
}

async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || "chrome",
      headless: true,
    });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function startPreview(port: number): Promise<ChildProcessWithoutNullStreams> {
  const viteBin = path.join(appRoot, "node_modules/vite/bin/vite.js");
  const child = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: appRoot,
    env: {
      ...process.env,
      LINK_DESKTOP_E2E_MOCK_WEBRTC: "1",
    },
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out starting Vite preview.\n${output}`)), 20_000);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Vite preview exited with ${code}.\n${output}`));
    });
    const poll = setInterval(async () => {
      if (await canConnect(port)) {
        clearInterval(poll);
        clearTimeout(timeout);
        resolve();
      }
    }, 100);
  });

  return child;
}

function stopPreview(child: ChildProcessWithoutNullStreams) {
  if (!child.killed) child.kill();
}

async function closeElectron(app: ElectronApplication) {
  try {
    await app.close();
  } catch {
    await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => undefined);
  }
}

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate an E2E preview port."));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function canConnect(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function liveSkipReason() {
  if (process.env.LINK_DESKTOP_LIVE_CALL_E2E !== "1") {
    return `Set LINK_DESKTOP_LIVE_CALL_E2E=1 and LINK_DESKTOP_LIVE_CALL_CONFIRM=${targetNumber} to place a real call.`;
  }
  return false;
}
