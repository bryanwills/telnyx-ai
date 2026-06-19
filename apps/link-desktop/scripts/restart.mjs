import { execFile, spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { prepareMacDevRuntime } from "./mac-dev-runtime.mjs";
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const mainEntry = path.join(appDir, "src/main/main.js");
const rendererEntry = path.join(appDir, "dist/renderer/index.html");
const pidFile = "/tmp/telnyx-link-desktop.pid";
const logFile = "/tmp/telnyx-link-desktop.log";

async function sh(command) {
  return execFileAsync("/bin/zsh", ["-lc", command], { cwd: appDir, maxBuffer: 1024 * 1024 * 8 });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function killExisting() {
  const { stdout } = await sh(
    "ps aux | rg 'apps/link-desktop/node_modules/electron|Electron.app/Contents/MacOS/Electron|Telnyx Cloud Link.app/Contents/MacOS/Electron|Telnyx Cloud Link.app/Contents/MacOS/Telnyx Cloud Link|Link.app/Contents/MacOS/Electron|default_app.asar|apps/link-desktop/src/main/main.js' | rg -v 'rg ' | awk '{print $2}'",
  ).catch(() => ({ stdout: "" }));
  const pids = stdout.split(/\s+/).filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  await sleep(1000);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

async function raiseWindow() {
  if (process.platform !== "darwin") return;
  await sh(`osascript <<'APPLESCRIPT'
tell application "System Events"
  repeat with processName in {"Telnyx Cloud Link", "Link", "Electron"}
    if exists process processName then
      tell process processName
        try
          set frontmost to true
        end try
        repeat with w in windows
          try
            set value of attribute "AXMinimized" of w to false
          end try
          try
            set position of w to {80, 80}
            set size of w to {1280, 860}
          end try
          try
            perform action "AXRaise" of w
          end try
        end repeat
        return {processName, frontmost, count of windows}
      end tell
    end if
  end repeat
  return "No Telnyx Cloud Link process"
end tell
APPLESCRIPT`).catch(() => undefined);
}

async function resolveDesktopExecutable() {
  if (process.platform === "darwin") {
    return (await prepareMacDevRuntime(appDir)).executablePath;
  }
  return path.join(appDir, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
}

async function verify() {
  const { stdout } = await sh(
    "ps aux | rg 'default_app.asar|apps/link-desktop/src/main|Electron.app/Contents/MacOS/Electron|\\.dev-runtime/Telnyx Cloud Link\\.app/Contents/MacOS/Electron|\\.dev-runtime/Link\\.app/Contents/MacOS/Electron' | rg -v 'rg '",
  ).catch(() => ({ stdout: "" }));
  if (stdout.includes("default_app.asar")) {
    throw new Error("Electron default app launched instead of Telnyx Cloud Link.");
  }
  if (!stdout.includes(".dev-runtime/Telnyx Cloud Link.app/Contents/MacOS/Electron") && !stdout.includes(".dev-runtime/Link.app/Contents/MacOS/Electron") && !stdout.includes("apps/link-desktop/src/main/main.js")) {
    throw new Error("Telnyx Cloud Link main process was not found.");
  }
  return stdout.trim();
}

await fs.writeFile(logFile, "");
await killExisting();
const logFd = fsSync.openSync(logFile, "a");
const desktopExecutable = await resolveDesktopExecutable();
const childArgs = process.platform === "darwin" ? [] : [mainEntry];
const child = spawn(desktopExecutable, childArgs, {
  cwd: appDir,
  detached: true,
  env: {
    ...process.env,
    LINK_DESKTOP_RENDERER: rendererEntry,
  },
  stdio: ["ignore", logFd, logFd],
});
child.unref();
await fs.writeFile(pidFile, `${child.pid}\n`);

await sleep(6000);
await raiseWindow();
const processList = await verify();

console.log(`Telnyx Cloud Link desktop restarted. PID: ${child.pid}`);
console.log(processList);
