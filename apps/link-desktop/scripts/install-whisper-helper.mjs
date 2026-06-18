import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(import.meta.dirname, "..");
const whisperRoot = path.join(appRoot, "native", "telnyx-whisper");
const buildScriptPath = path.join(whisperRoot, "Scripts", "build-app.sh");
const helperExecutablePath = path.join(whisperRoot, "Telnyx Link.app", "Contents", "MacOS", "TelnyxDictation");

const { stdout, stderr } = await execFileAsync("bash", [buildScriptPath, "release"], {
  cwd: whisperRoot,
  maxBuffer: 8 * 1024 * 1024,
});

if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);

await fs.access(helperExecutablePath);

console.log("Prepared bundled dictation helper:");
console.log(`- ${path.relative(appRoot, helperExecutablePath)}`);
console.log("Package `native/telnyx-whisper/Telnyx Link.app` into Link app resources for release builds.");
