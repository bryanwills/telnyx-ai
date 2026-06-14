import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(import.meta.dirname, "..");
const binDir = path.join(appRoot, "bin");
const repo = "openclaw/gogcli";
const targets = [
  { goos: "darwin", goarch: "arm64", output: "gog-macos-arm64" },
  { goos: "darwin", goarch: "amd64", output: "gog-macos-amd64" },
];

await fs.mkdir(binDir, { recursive: true });
const release = await latestRelease();

for (const target of targets) {
  const asset = release.assets.find((item) =>
    item.name.includes(`_${target.goos}_${target.goarch}.tar.gz`),
  );
  if (!asset) {
    throw new Error(`No gogcli release asset found for ${target.goos}/${target.goarch}.`);
  }
  await installTarball(asset.browser_download_url, target.output);
}

console.log(`Installed gogcli ${release.tag_name} into ${binDir}`);

async function latestRelease() {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed with ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function installTarball(url, outputName) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "link-gogcli-"));
  const archivePath = path.join(tmpDir, "gogcli.tar.gz");
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url}: ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(archivePath));
  await execFileAsync("tar", ["-xzf", archivePath, "-C", tmpDir]);
  const binaryPath = await findBinary(tmpDir);
  const outputPath = path.join(binDir, outputName);
  await fs.copyFile(binaryPath, outputPath);
  await fs.chmod(outputPath, 0o755);
  await fs.rm(tmpDir, { recursive: true, force: true });
}

async function findBinary(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findBinary(fullPath).catch(() => "");
      if (nested) return nested;
      continue;
    }
    if (entry.name === "gog" || entry.name === "gog.exe") return fullPath;
  }
  throw new Error(`Downloaded gogcli archive did not contain a gog binary.`);
}
