import test from "node:test";
import assert from "node:assert/strict";

import {
  assessFit,
  deriveAiModelRoutes,
  isTaskRoutingEligible,
  normalizeCatalogModel,
} from "../src/main/model-center.js";

const gib = 1024 ** 3;
const assessFitUnsafe = assessFit as (input: any) => any;
const deriveAiModelRoutesUnsafe = deriveAiModelRoutes as (input: any) => Array<any>;

test("normalizeCatalogModel infers policy and variant defaults for curated entries", () => {
  const model = normalizeCatalogModel({
    id: "ollama:test-model",
    label: "Test Model",
    providerId: "ollama",
    engineId: "ollama",
    capabilities: ["chat", "mcp-safe"],
    variants: [
      {
        externalId: "test-model",
        sizeBytes: 3 * gib,
        contextWindow: 8192,
      },
    ],
    fallbackChain: ["telnyx:fallback"],
  });

  assert.equal(model.id, "ollama:test-model");
  assert.equal(model.dataBoundary, "local");
  assert.equal(model.taskRoutingEligible, true);
  assert.equal(model.policy.mcpSafe, true);
  assert.equal(model.policy.dataBoundary, "local");
  assert.equal(model.variants[0]?.id, "ollama:test-model@0");
  assert.equal(model.variants[0]?.providerId, "ollama");
  assert.equal(model.variants[0]?.engineId, "ollama");
  assert.deepEqual(model.fallbackChain, ["telnyx:fallback"]);
});

test("assessFit distinguishes fit, slow, and wont-fit hardware states", () => {
  const variant = {
    id: "ollama:test-model",
    externalId: "test-model",
    sizeBytes: 4 * gib,
    contextWindow: 8192,
  };

  const fits = assessFitUnsafe({
    hardwareProfile: { totalMemoryBytes: 16 * gib, availableStorageBytes: 32 * gib },
    variant,
    policy: { minimumRamBytes: 8 * gib, minimumStorageBytes: 6 * gib },
    engineId: "ollama",
  });
  assert.equal(fits.status, "fits");

  const slow = assessFitUnsafe({
    hardwareProfile: { totalMemoryBytes: Math.floor(8.5 * gib), availableStorageBytes: 32 * gib },
    variant,
    policy: { minimumRamBytes: 8 * gib, minimumStorageBytes: 6 * gib },
    engineId: "ollama",
  });
  assert.equal(slow.status, "slow");
  assert.match(slow.reason, /recommended/i);

  const wontFit = assessFitUnsafe({
    hardwareProfile: { totalMemoryBytes: 6 * gib, availableStorageBytes: 32 * gib },
    variant,
    policy: { minimumRamBytes: 8 * gib, minimumStorageBytes: 6 * gib },
    engineId: "ollama",
  });
  assert.equal(wontFit.status, "wont_fit");
  assert.match(wontFit.reason, /Needs about .* RAM/);
});

test("task routing eligibility excludes embeddings and policy-hidden models", () => {
  assert.equal(isTaskRoutingEligible({ capabilities: ["embedding"] }), false);
  assert.equal(isTaskRoutingEligible({ policy: { hiddenByPolicy: true } }), false);
  assert.equal(isTaskRoutingEligible({ taskRoutingEligible: true }), true);
  assert.equal(isTaskRoutingEligible({ variants: [{ sizeBytes: 7 * gib }] }), false);
});

test("deriveAiModelRoutes builds role routes, direct routes, and fallback chains", () => {
  const models = [
    normalizeCatalogModel({
      id: "ollama:primary",
      label: "Primary Local",
      providerId: "ollama",
      engineId: "ollama",
      capabilities: ["chat"],
      fallbackChain: ["telnyx:fallback"],
      variants: [{ externalId: "primary", sizeBytes: 3 * gib, contextWindow: 8192 }],
    }),
    normalizeCatalogModel({
      id: "telnyx:fallback",
      label: "Fallback Cloud",
      providerId: "telnyx",
      capabilities: ["chat", "budget"],
      taskRoutingEligible: true,
      variants: [{ externalId: "fallback-cloud", contextWindow: 128000 }],
    }),
    normalizeCatalogModel({
      id: "ollama:routing",
      label: "Routing Local",
      providerId: "ollama",
      engineId: "ollama",
      capabilities: ["chat", "routing", "mcp-safe"],
      taskRoutingEligible: true,
      variants: [{ externalId: "routing", sizeBytes: 2 * gib, contextWindow: 32768 }],
    }),
  ];

  const routes = deriveAiModelRoutesUnsafe({
    roles: {
      chatPrimary: { modelId: "ollama:primary" },
      chatFallback: { modelId: "telnyx:fallback" },
      taskRouting: { modelId: "ollama:routing" },
      agentDefault: { modelId: "ollama:primary" },
    },
    models,
    localEngineDefaultId: "ollama:primary",
  });

  const primary = routes.find((route) => route.id === "auto/ask-before-cloud");
  const fallback = routes.find((route) => route.id === "auto/local-only");
  const taskRouting = routes.find((route) => route.id === "role/task-routing");
  const localDefault = routes.find((route) => route.id === "local/default");
  const directLocal = routes.find((route) => route.id === "local/model/primary");
  const directCloud = routes.find((route) => route.id === "telnyx/model/fallback-cloud");

  assert.ok(primary);
  assert.ok(fallback);
  assert.ok(taskRouting);
  assert.ok(localDefault);
  assert.ok(directLocal);
  assert.ok(directCloud);
  assert.equal(primary?.targetModel, "primary");
  assert.deepEqual(primary?.fallbackRouteIds, ["auto/local-only", "telnyx/model/fallback-cloud"]);
  assert.equal(taskRouting?.provider, "local");
  assert.equal(directCloud?.provider, "telnyx");
});
