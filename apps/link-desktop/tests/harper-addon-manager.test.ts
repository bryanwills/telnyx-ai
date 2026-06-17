import test from "node:test";
import assert from "node:assert/strict";

import { compareHarperVersions, defaultHarperAddonSettings, normalizeHarperAddonSettings } from "../src/main/harper-addon.js";

test("Harper add-on defaults prefer auto-update and local npm metadata", () => {
  const settings = defaultHarperAddonSettings("2026-06-17T00:00:00.000Z");

  assert.equal(settings.installed, false);
  assert.equal(settings.enabled, false);
  assert.equal(settings.autoUpdate, true);
  assert.equal(settings.installState, "not_installed");
  assert.equal(settings.packageName, "harper.js");
  assert.equal(settings.registryUrl, "https://registry.npmjs.org/harper.js");
});

test("Harper add-on normalization keeps installed versions and upgrade signals coherent", () => {
  const settings = normalizeHarperAddonSettings({
    installedVersion: "2.4.0",
    latestVersion: "2.5.1",
    enabled: true,
    autoUpdate: false,
    defaultAction: "polish",
    dialect: "british",
    installState: "ready",
  });

  assert.equal(settings.installed, true);
  assert.equal(settings.enabled, true);
  assert.equal(settings.autoUpdate, false);
  assert.equal(settings.defaultAction, "polish");
  assert.equal(settings.dialect, "british");
  assert.equal(settings.updateAvailable, true);
});

test("Harper add-on version comparison sorts stable versions ahead of prereleases", () => {
  assert.equal(compareHarperVersions("2.5.0", "2.4.9") > 0, true);
  assert.equal(compareHarperVersions("2.5.0", "2.5.0-beta.1") > 0, true);
  assert.equal(compareHarperVersions("2.5.0", "2.5.0"), 0);
});
