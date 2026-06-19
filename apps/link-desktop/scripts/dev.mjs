import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { prepareMacDevRuntime } from "./mac-dev-runtime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");

loadEnvLocal();

const server = await createServer({
  configFile: "vite.config.ts",
});

await server.listen();
const urls = server.resolvedUrls?.local ?? ["http://127.0.0.1:5173/"];
const rendererUrl = urls[0] ?? "http://127.0.0.1:5173/";
console.log(`Renderer: ${rendererUrl}`);

const { executablePath: electronExecutable } = process.platform === "darwin"
  ? await prepareMacDevRuntime(appDir)
  : {
    executablePath: process.platform === "win32"
      ? path.join(appDir, "node_modules", ".bin", "electron.cmd")
      : path.join(appDir, "node_modules", ".bin", "electron"),
  };
const electron = spawn(
  electronExecutable,
  process.platform === "darwin" ? [] : ["src/main/main.js"],
  {
    cwd: appDir,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: rendererUrl,
    },
  },
);

electron.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});

process.on("SIGINT", async () => {
  electron.kill("SIGINT");
  await server.close();
  process.exit(0);
});

function loadEnvLocal() {
  const envPath = new URL("../.env.local", import.meta.url);
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}
