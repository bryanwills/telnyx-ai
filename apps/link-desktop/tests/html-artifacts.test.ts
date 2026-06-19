import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("HTML Session Reviews can be materialized, previewed, and deployed through local Edge apps", async () => {
  const api = await readFile("src/renderer/api.ts", "utf8");
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const main = await readFile("src/main/main.js", "utf8");
  const preload = await readFile("src/main/preload.cjs", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(api, /kind: "markdown" \| "pdf" \| "html"/);
  assert.match(api, /export interface LinkHtmlArtifactMaterializationResult/);
  assert.match(api, /materializeHtmlArtifact\(input: \{ artifact: ChatArtifact; slug\?: string; replaceExisting\?: boolean \}\): Promise<LinkHtmlArtifactMaterializationResult>/);
  assert.match(api, /buildSessionArtifactHtml/);
  assert.match(api, /Session Review/);
  assert.match(api, /--bg: #f7f6f4/);
  assert.match(api, /--bg: #151515/);

  assert.match(preload, /materializeHtmlArtifact:\s*\(input\) => ipcRenderer\.invoke\("link:edge-materialize-html-artifact", input\)/);
  assert.match(main, /secureIpcHandle\("link:edge-materialize-html-artifact", \(_event, input\) => materializeHtmlArtifact\(input\)\)/);
  assert.match(main, /async function materializeHtmlArtifact/);
  assert.match(main, /link-app\.json/);
  assert.match(main, /node scripts\/link-build\.mjs/);
  assert.match(main, /edge\.html_artifact\.materialized/);

  assert.match(app, /function ArtifactViewer/);
  assert.match(app, /saveLocalHtmlArtifact/);
  assert.match(app, /previewHtmlArtifact/);
  assert.match(app, /deployHtmlArtifact/);
  assert.match(app, /linkApi\.materializeHtmlArtifact/);
  assert.match(app, /Session Review/);
  assert.match(app, /sandbox="allow-forms allow-popups allow-scripts"/);

  assert.match(styles, /\.artifactPublishBar\s*\{/);
  assert.match(styles, /\.artifactHtmlFrame\s*\{/);
});
