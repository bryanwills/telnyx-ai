import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Harper add-on ships as a runtime-managed npm package with desktop UI hooks", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
    dependencies: Record<string, string>;
  };
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const helper = await readFile("src/renderer/harper-addon.ts", "utf8");
  const manager = await readFile("src/main/harper-addon.js", "utf8");
  const preload = await readFile("src/main/preload.cjs", "utf8");
  const notice = await readFile("public/oss/THIRD_PARTY_NOTICES.txt", "utf8");
  const license = await readFile("public/oss/harper-apache-2.0.txt", "utf8");

  assert.equal(pkg.dependencies["harper.js"], undefined);
  assert.match(manager, /const harperRegistryUrl = "https:\/\/registry\.npmjs\.org\/harper\.js"/);
  assert.match(manager, /new linterRuntime\.moduleExports\.LocalLinter/);
  assert.match(manager, /installAddon/);
  assert.match(manager, /reviewText/);
  assert.match(helper, /linkApi\.installHarperAddon/);
  assert.match(helper, /linkApi\.reviewHarperText/);
  assert.match(helper, /harperLicenseUrl/);
  assert.match(preload, /getHarperAddonStatus/);
  assert.match(preload, /installHarperAddon/);
  assert.match(preload, /reviewHarperText/);
  assert.match(app, /Harper Grammar Add-on/);
  assert.match(app, /Harper grammar add-on/);
  assert.match(app, /Review with Harper/);
  assert.match(app, /Auto-update/);
  assert.match(app, /Check latest/);
  assert.match(notice, /optional local grammar add-on/);
  assert.match(notice, /published harper\.js npm package/);
  assert.match(notice, /Project URL: https:\/\/github\.com\/Automattic\/harper/);
  assert.match(license, /Apache License/);
  assert.match(license, /Version 2\.0, January 2004/);
});
