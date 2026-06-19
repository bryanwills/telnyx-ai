import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(appRoot, "../..");
const linkPackageRoot = join(repoRoot, "tools", "link");
const dist = join(appRoot, "dist");

run("npm", ["run", "build"], linkPackageRoot);

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "vendor"), { recursive: true });
await cp(join(linkPackageRoot, "dist"), join(dist, "vendor", "link"), { recursive: true });
await writeFile(join(dist, "index.js"), `import { createSkillRegistryServer, listenSkillRegistryServer, SkillRegistryService } from "./vendor/link/index.js";

const port = Number(process.env.PORT || 8080);
const requireAuth = process.env.LINK_SKILL_REGISTRY_DEV_NO_AUTH !== "1";
const requireAuthContext = process.env.LINK_SKILL_REGISTRY_REQUIRE_AUTH_CONTEXT === "1";
const storagePath = process.env.LINK_SKILL_REGISTRY_STORAGE;
const service = new SkillRegistryService({ storagePath });
const server = createSkillRegistryServer(service, { requireAuth, requireAuthContext });
const listener = await listenSkillRegistryServer(server, port, "0.0.0.0");

console.log(\`Cloud Link Skill Registry listening at \${listener.url}\`);
`, "utf8");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}
