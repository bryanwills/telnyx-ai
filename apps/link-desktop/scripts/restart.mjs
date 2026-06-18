import { execFile, spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { macDevExecutablePath, prepareMacDevRuntime } from "./mac-dev-runtime.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const rawElectronBin = path.join(appDir, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
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
    "ps aux | rg 'apps/link-desktop/node_modules/electron|Electron.app/Contents/MacOS/Electron|Link.app/Contents/MacOS/Link|default_app.asar|apps/link-desktop/src/main/main.js' | rg -v 'rg ' | awk '{print $2}'",
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
  if exists process "Link" then
    tell process "Link"
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
      return {"Link", frontmost, count of windows}
    end tell
  end if
  return "No Link process"
end tell
APPLESCRIPT`).catch(() => undefined);
}

async function resolveDesktopExecutable() {
  if (process.platform !== "darwin") return rawElectronBin;
  await prepareMacDevRuntime(appDir);
  return macDevExecutablePath;
}

async function verify() {
  const { stdout } = await sh(
    "ps aux | rg 'default_app.asar|apps/link-desktop/src/main|Electron.app/Contents/MacOS/Electron|Link.app/Contents/MacOS/Link' | rg -v 'rg '",
  ).catch(() => ({ stdout: "" }));
  if (stdout.includes("default_app.asar")) {
    throw new Error("Electron default app launched instead of Link.");
  }
  if (stdout.includes(rawElectronBin)) {
    throw new Error("Raw Electron.app process survived restart.");
  }
  if (!stdout.includes("apps/link-desktop/src/main")) {
    throw new Error("Link renderer process was not found.");
  }
  return stdout.trim();
}

await fs.writeFile(logFile, "");
await killExisting();
const logFd = fsSync.openSync(logFile, "a");
const desktopExecutable = await resolveDesktopExecutable();

const child = spawn(desktopExecutable, [mainEntry], {
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

console.log(`Link desktop restarted. PID: ${child.pid}`);
console.log(processList);
