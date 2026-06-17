const gib = 1024 ** 3;

export const modelCenterRoleOrder = ["chatPrimary", "chatFallback", "taskRouting", "agentDefault"];

export const modelCenterRoleMeta = {
  chatPrimary: {
    id: "chatPrimary",
    label: "Chat primary",
    description: "Default model for Link chat.",
    routeId: "auto/ask-before-cloud",
  },
  chatFallback: {
    id: "chatFallback",
    label: "Chat fallback",
    description: "Fallback model when the primary route fails.",
    routeId: "auto/local-only",
  },
  taskRouting: {
    id: "taskRouting",
    label: "Task routing",
    description: "Lightweight model used for MCP and tool routing.",
    routeId: "role/task-routing",
  },
  agentDefault: {
    id: "agentDefault",
    label: "Agent default",
    description: "Default model for self-hosted local agents.",
    routeId: "role/agent-default",
  },
};

export const defaultLocalApiServerConfig = {
  host: "127.0.0.1",
  port: 4090,
  corsEnabled: false,
  exposedRoleIds: ["chatPrimary", "taskRouting"],
};

export function curatedModelCatalog() {
  return [
    normalizeCatalogModel({
      id: "ollama:llama3.2",
      label: "Llama 3.2 3B Instruct",
      providerId: "ollama",
      engineId: "ollama",
      source: "telnyx-curated",
      description: "Balanced local chat default for enterprise desktop workflows.",
      capabilities: ["chat", "offline", "mcp-safe"],
      dataBoundary: "local",
      recommended: true,
      recommendedRoleEligibility: ["chatPrimary", "chatFallback", "agentDefault"],
      taskRoutingEligible: true,
      fallbackChain: ["ollama:qwen2.5:3b-instruct-q4_K_M", "telnyx:MiniMaxAI/MiniMax-M3-MXFP8"],
      variants: [
        {
          id: "ollama:llama3.2",
          label: "llama3.2",
          engineId: "ollama",
          providerId: "ollama",
          externalId: "llama3.2",
          format: "ollama",
          quantization: "Q4_K_M",
          sizeBytes: Math.round(2.2 * gib),
          contextWindow: 8192,
        },
      ],
      policy: {
        minimumRamBytes: Math.round(8 * gib),
        minimumStorageBytes: Math.round(4 * gib),
        mcpSafe: true,
        coding: false,
        vision: false,
        speechCleanup: true,
      },
    }),
    normalizeCatalogModel({
      id: "ollama:qwen2.5:3b-instruct-q4_K_M",
      label: "Qwen 2.5 3B Instruct",
      providerId: "ollama",
      engineId: "ollama",
      source: "telnyx-curated",
      description: "Small local routing model for tool selection and background chores.",
      capabilities: ["chat", "offline", "routing", "mcp-safe", "coding"],
      dataBoundary: "local",
      recommended: true,
      recommendedRoleEligibility: ["taskRouting", "chatFallback"],
      taskRoutingEligible: true,
      fallbackChain: ["ollama:llama3.2"],
      variants: [
        {
          id: "ollama:qwen2.5:3b-instruct-q4_K_M",
          label: "qwen2.5:3b-instruct-q4_K_M",
          engineId: "ollama",
          providerId: "ollama",
          externalId: "qwen2.5:3b-instruct-q4_K_M",
          format: "ollama",
          quantization: "Q4_K_M",
          sizeBytes: Math.round(2.3 * gib),
          contextWindow: 32768,
        },
      ],
      policy: {
        minimumRamBytes: Math.round(8 * gib),
        minimumStorageBytes: Math.round(4 * gib),
        mcpSafe: true,
        coding: true,
        vision: false,
        speechCleanup: false,
      },
    }),
    normalizeCatalogModel({
      id: "ollama:phi3:mini",
      label: "Phi 3 Mini",
      providerId: "ollama",
      engineId: "ollama",
      source: "telnyx-curated",
      description: "Compact local fallback for constrained laptops.",
      capabilities: ["chat", "offline", "mcp-safe"],
      dataBoundary: "local",
      recommended: false,
      recommendedRoleEligibility: ["chatFallback", "taskRouting"],
      taskRoutingEligible: true,
      fallbackChain: ["ollama:qwen2.5:3b-instruct-q4_K_M"],
      variants: [
        {
          id: "ollama:phi3:mini",
          label: "phi3:mini",
          engineId: "ollama",
          providerId: "ollama",
          externalId: "phi3:mini",
          format: "ollama",
          quantization: "Q4_K_M",
          sizeBytes: Math.round(2.4 * gib),
          contextWindow: 4096,
        },
      ],
      policy: {
        minimumRamBytes: Math.round(8 * gib),
        minimumStorageBytes: Math.round(4 * gib),
        mcpSafe: true,
        coding: false,
        vision: false,
        speechCleanup: false,
      },
    }),
    normalizeCatalogModel({
      id: "ollama:qwen2.5-coder:7b-instruct-q4_K_M",
      label: "Qwen 2.5 Coder 7B",
      providerId: "ollama",
      engineId: "ollama",
      source: "telnyx-curated",
      description: "Larger local coding model for agents and review tasks.",
      capabilities: ["chat", "offline", "coding"],
      dataBoundary: "local",
      recommended: false,
      recommendedRoleEligibility: ["agentDefault", "chatPrimary"],
      taskRoutingEligible: false,
      fallbackChain: ["ollama:llama3.2"],
      variants: [
        {
          id: "ollama:qwen2.5-coder:7b-instruct-q4_K_M",
          label: "qwen2.5-coder:7b-instruct-q4_K_M",
          engineId: "ollama",
          providerId: "ollama",
          externalId: "qwen2.5-coder:7b-instruct-q4_K_M",
          format: "ollama",
          quantization: "Q4_K_M",
          sizeBytes: Math.round(4.8 * gib),
          contextWindow: 32768,
        },
      ],
      policy: {
        minimumRamBytes: Math.round(16 * gib),
        minimumStorageBytes: Math.round(8 * gib),
        mcpSafe: false,
        coding: true,
        vision: false,
        speechCleanup: false,
      },
    }),
    normalizeCatalogModel({
      id: "telnyx:moonshotai/Kimi-K2.6",
      label: "Kimi K2.6",
      providerId: "telnyx",
      source: "telnyx-curated",
      description: "Best-quality Telnyx cloud default for enterprise hybrid chat.",
      capabilities: ["chat", "reasoning"],
      dataBoundary: "telnyx-cloud",
      recommended: true,
      recommendedRoleEligibility: ["chatPrimary", "chatFallback", "agentDefault"],
      taskRoutingEligible: false,
      fallbackChain: ["telnyx:zai-org/GLM-5.1-FP8", "telnyx:MiniMaxAI/MiniMax-M3-MXFP8"],
      variants: [
        {
          id: "telnyx:moonshotai/Kimi-K2.6",
          label: "moonshotai/Kimi-K2.6",
          providerId: "telnyx",
          externalId: "moonshotai/Kimi-K2.6",
          format: "openai",
          contextWindow: null,
        },
      ],
      policy: {
        minimumRamBytes: 0,
        minimumStorageBytes: 0,
        mcpSafe: false,
        coding: false,
        vision: false,
        speechCleanup: false,
      },
    }),
    normalizeCatalogModel({
      id: "telnyx:zai-org/GLM-5.1-FP8",
      label: "GLM 5.1 FP8",
      providerId: "telnyx",
      source: "telnyx-curated",
      description: "Reasoning and tool-capable Telnyx cloud model.",
      capabilities: ["chat", "reasoning", "tools"],
      dataBoundary: "telnyx-cloud",
      recommended: true,
      recommendedRoleEligibility: ["chatFallback", "agentDefault"],
      taskRoutingEligible: false,
      fallbackChain: ["telnyx:MiniMaxAI/MiniMax-M3-MXFP8"],
      variants: [
        {
          id: "telnyx:zai-org/GLM-5.1-FP8",
          label: "zai-org/GLM-5.1-FP8",
          providerId: "telnyx",
          externalId: "zai-org/GLM-5.1-FP8",
          format: "openai",
          contextWindow: null,
        },
      ],
      policy: {
        minimumRamBytes: 0,
        minimumStorageBytes: 0,
        mcpSafe: false,
        coding: true,
        vision: false,
        speechCleanup: false,
      },
    }),
    normalizeCatalogModel({
      id: "telnyx:MiniMaxAI/MiniMax-M3-MXFP8",
      label: "MiniMax M3 MXFP8",
      providerId: "telnyx",
      source: "telnyx-curated",
      description: "Budget-friendly long-context Telnyx cloud fallback.",
      capabilities: ["chat", "budget", "long-context"],
      dataBoundary: "telnyx-cloud",
      recommended: true,
      recommendedRoleEligibility: ["chatFallback", "taskRouting"],
      taskRoutingEligible: true,
      fallbackChain: ["ollama:qwen2.5:3b-instruct-q4_K_M"],
      variants: [
        {
          id: "telnyx:MiniMaxAI/MiniMax-M3-MXFP8",
          label: "MiniMaxAI/MiniMax-M3-MXFP8",
          providerId: "telnyx",
          externalId: "MiniMaxAI/MiniMax-M3-MXFP8",
          format: "openai",
          contextWindow: null,
        },
      ],
      policy: {
        minimumRamBytes: 0,
        minimumStorageBytes: 0,
        mcpSafe: false,
        coding: false,
        vision: false,
        speechCleanup: false,
      },
    }),
    normalizeCatalogModel({
      id: "telnyx:thenlper/gte-large",
      label: "GTE Large",
      providerId: "telnyx",
      source: "telnyx-curated",
      description: "Embedding model kept for future retrieval flows.",
      capabilities: ["embedding"],
      dataBoundary: "telnyx-cloud",
      recommended: false,
      recommendedRoleEligibility: [],
      taskRoutingEligible: false,
      fallbackChain: [],
      variants: [
        {
          id: "telnyx:thenlper/gte-large",
          label: "thenlper/gte-large",
          providerId: "telnyx",
          externalId: "thenlper/gte-large",
          format: "openai",
          contextWindow: null,
        },
      ],
      policy: {
        minimumRamBytes: 0,
        minimumStorageBytes: 0,
        hiddenByPolicy: true,
        mcpSafe: false,
        coding: false,
        vision: false,
        speechCleanup: false,
      },
    }),
  ];
}

export function normalizeCatalogModel(input = {}) {
  const id = String(input.id || "").trim();
  if (!id) throw new Error("Catalog model id is required.");
  const capabilities = uniqueStrings(input.capabilities);
  const variants = Array.isArray(input.variants) && input.variants.length > 0
    ? input.variants.map((variant, index) => normalizeModelVariant({
      ...variant,
      providerId: variant?.providerId ?? input.providerId,
      engineId: variant?.engineId ?? input.engineId,
      format: variant?.format ?? input.format,
    }, { fallbackId: `${id}@${index}` }))
    : [normalizeModelVariant({ id, externalId: id, label: input.label || id, providerId: input.providerId, engineId: input.engineId, format: input.format, sizeBytes: input.sizeBytes, contextWindow: input.contextWindow }, { fallbackId: id })];
  const policy = input.policy && typeof input.policy === "object" ? input.policy : {};
  return {
    id,
    label: String(input.label || variants[0]?.label || id),
    providerId: String(input.providerId || variants[0]?.providerId || "custom"),
    engineId: input.engineId ? String(input.engineId) : variants[0]?.engineId || "",
    source: String(input.source || "custom"),
    description: String(input.description || ""),
    capabilities,
    dataBoundary: String(input.dataBoundary || inferDataBoundary(input.providerId || variants[0]?.providerId, input.engineId || variants[0]?.engineId)),
    recommended: Boolean(input.recommended),
    recommendedRoleEligibility: uniqueStrings(input.recommendedRoleEligibility),
    taskRoutingEligible: input.taskRoutingEligible === undefined ? capabilities.includes("routing") || capabilities.includes("mcp-safe") : Boolean(input.taskRoutingEligible),
    fallbackChain: uniqueStrings(input.fallbackChain),
    variants,
    policy: {
      minimumRamBytes: safeNumber(policy.minimumRamBytes),
      minimumStorageBytes: safeNumber(policy.minimumStorageBytes),
      hiddenByPolicy: Boolean(policy.hiddenByPolicy),
      mcpSafe: policy.mcpSafe === undefined ? capabilities.includes("mcp-safe") : Boolean(policy.mcpSafe),
      speechCleanup: Boolean(policy.speechCleanup),
      vision: Boolean(policy.vision),
      coding: Boolean(policy.coding),
      dataBoundary: String(policy.dataBoundary || inferDataBoundary(input.providerId || variants[0]?.providerId, input.engineId || variants[0]?.engineId)),
    },
  };
}

export function normalizeModelVariant(input = {}, { fallbackId = "" } = {}) {
  const id = String(input.id || fallbackId || "").trim();
  if (!id) throw new Error("Variant id is required.");
  return {
    id,
    label: String(input.label || input.externalId || id),
    providerId: String(input.providerId || "custom"),
    engineId: String(input.engineId || ""),
    externalId: String(input.externalId || input.label || id),
    format: String(input.format || "custom"),
    quantization: String(input.quantization || ""),
    sizeBytes: safeNumber(input.sizeBytes),
    contextWindow: safeNumber(input.contextWindow),
  };
}

export function normalizeModelCenterPreferences(input = {}) {
  const localApiServer = input.localApiServer && typeof input.localApiServer === "object" ? input.localApiServer : {};
  const roles = input.roles && typeof input.roles === "object" ? input.roles : {};
  const importedCatalogModels = Array.isArray(input.importedCatalogModels) ? input.importedCatalogModels : [];
  return {
    version: 1,
    roles: {
      chatPrimary: normalizeRoleAssignment(roles.chatPrimary, "chatPrimary"),
      chatFallback: normalizeRoleAssignment(roles.chatFallback, "chatFallback"),
      taskRouting: normalizeRoleAssignment(roles.taskRouting, "taskRouting"),
      agentDefault: normalizeRoleAssignment(roles.agentDefault, "agentDefault"),
    },
    providers: normalizeProviderConfigMap(input.providers),
    engines: normalizeEngineConfigMap(input.engines),
    importedCatalogModels: importedCatalogModels.map((model) => normalizeCatalogModel(model)),
    localApiServer: {
      host: String(localApiServer.host || defaultLocalApiServerConfig.host),
      port: clampPort(localApiServer.port, defaultLocalApiServerConfig.port),
      corsEnabled: Boolean(localApiServer.corsEnabled),
      exposedRoleIds: uniqueStrings(localApiServer.exposedRoleIds).filter((roleId) => modelCenterRoleOrder.includes(roleId)),
    },
  };
}

export function normalizeHardwareProfile(input = {}) {
  return {
    totalMemoryBytes: safeNumber(input.totalMemoryBytes),
    freeMemoryBytes: safeNumber(input.freeMemoryBytes),
    gpuMemoryBytes: safeNumber(input.gpuMemoryBytes),
    availableStorageBytes: safeNumber(input.availableStorageBytes),
    architecture: String(input.architecture || ""),
    platform: String(input.platform || ""),
    cpuModel: String(input.cpuModel || ""),
    recommendedContextWindow: safeNumber(input.recommendedContextWindow || 32768),
    updatedAt: String(input.updatedAt || new Date().toISOString()),
  };
}

export function assessFit({ hardwareProfile, variant, policy = {}, engineId = "" } = {}) {
  const hardware = normalizeHardwareProfile(hardwareProfile);
  const normalizedVariant = normalizeModelVariant(variant || {}, { fallbackId: "unknown" });
  const sizeBytes = safeNumber(normalizedVariant.sizeBytes);
  if (!sizeBytes || !hardware.totalMemoryBytes) {
    return {
      status: "unknown",
      label: "Unknown fit",
      reason: "Link needs both model size and hardware telemetry to estimate fit.",
      requiredMemoryBytes: 0,
      recommendedMemoryBytes: 0,
      requiredStorageBytes: 0,
    };
  }

  const contextWindow = Math.max(0, safeNumber(normalizedVariant.contextWindow));
  const contextMultiplier = contextWindow > 32768 ? 0.35 : contextWindow > 8192 ? 0.18 : 0.08;
  const runtimeMultiplier = engineId === "ollama" ? 1.75 : 1.55;
  const requiredMemoryBytes = Math.ceil(sizeBytes * runtimeMultiplier + sizeBytes * contextMultiplier);
  const recommendedMemoryBytes = Math.ceil(requiredMemoryBytes * 1.2);
  const minimumRamBytes = Math.max(requiredMemoryBytes, safeNumber(policy.minimumRamBytes));
  const minimumStorageBytes = Math.max(Math.ceil(sizeBytes * 1.15), safeNumber(policy.minimumStorageBytes));
  const availableMemoryBytes = hardware.totalMemoryBytes;
  const availableStorageBytes = hardware.availableStorageBytes;

  if (availableStorageBytes && availableStorageBytes < minimumStorageBytes) {
    return {
      status: "wont_fit",
      label: "Won't fit",
      reason: `Needs about ${formatGiB(minimumStorageBytes)} of free storage and only ${formatGiB(availableStorageBytes)} is available.`,
      requiredMemoryBytes: minimumRamBytes,
      recommendedMemoryBytes,
      requiredStorageBytes: minimumStorageBytes,
    };
  }

  if (availableMemoryBytes < minimumRamBytes) {
    return {
      status: "wont_fit",
      label: "Won't fit",
      reason: `Needs about ${formatGiB(minimumRamBytes)} of RAM and this machine reports ${formatGiB(availableMemoryBytes)}.`,
      requiredMemoryBytes: minimumRamBytes,
      recommendedMemoryBytes,
      requiredStorageBytes: minimumStorageBytes,
    };
  }

  if (availableMemoryBytes < recommendedMemoryBytes) {
    return {
      status: "slow",
      label: "May be slow",
      reason: `It should run, but ${formatGiB(recommendedMemoryBytes)} of RAM is recommended for smoother context handling.`,
      requiredMemoryBytes: minimumRamBytes,
      recommendedMemoryBytes,
      requiredStorageBytes: minimumStorageBytes,
    };
  }

  return {
    status: "fits",
    label: "Fits",
    reason: `Estimated to fit on this machine with ${formatGiB(availableMemoryBytes)} of system memory.`,
    requiredMemoryBytes: minimumRamBytes,
    recommendedMemoryBytes,
    requiredStorageBytes: minimumStorageBytes,
  };
}

export function isTaskRoutingEligible(model) {
  if (!model || typeof model !== "object") return false;
  if (model.capabilities?.includes("embedding")) return false;
  if (model.policy?.hiddenByPolicy) return false;
  if (typeof model.taskRoutingEligible === "boolean") return model.taskRoutingEligible;
  const sizeBytes = safeNumber(model.variants?.[0]?.sizeBytes || model.sizeBytes);
  return sizeBytes === 0 || sizeBytes <= 5 * gib;
}

export function routeIdForModel(model = {}) {
  const providerId = String(model.providerId || "");
  const variant = Array.isArray(model.variants) && model.variants.length > 0 ? model.variants[0] : null;
  const target = String(variant?.externalId || model.targetModel || model.id || "");
  if (!target) return "";
  if (providerId === "ollama") return `local/model/${target}`;
  if (providerId === "telnyx") return `telnyx/model/${target}`;
  if (providerId === "managed-gateway") return `managed/model/${target}`;
  if (providerId === "anthropic") return `frontier/model/${target}`;
  return `model/${target}`;
}

export function deriveAiModelRoutes({ roles = {}, models = [], localEngineDefaultId = "", includeDirectRoutes = true } = {}) {
  const modelMap = new Map(models.map((model) => [model.id, model]));
  const routes = [];
  const directRouteIds = new Set();

  const addDirectRoute = (model) => {
    if (!model || model.policy?.hiddenByPolicy) return;
    const routeId = routeIdForModel(model);
    if (!routeId || directRouteIds.has(routeId)) return;
    directRouteIds.add(routeId);
    const variant = model.variants?.[0] || {};
    routes.push({
      id: routeId,
      modelName: routeId,
      label: `${providerRoutePrefix(model.providerId)}: ${model.label}`,
      provider: normalizeRouteProvider(model.providerId),
      dataBoundary: model.dataBoundary || inferDataBoundary(model.providerId, model.engineId),
      targetModel: variant.externalId || model.id,
      description: model.description || "",
      available: true,
      capabilities: model.capabilities || [],
      contextWindow: variant.contextWindow || null,
      fallbackRouteIds: (model.fallbackChain || []).map((modelId) => routeIdForModel(modelMap.get(modelId))).filter(Boolean),
    });
  };

  const addRoleRoute = (roleId, fallbackRoleIds = []) => {
    const roleMeta = modelCenterRoleMeta[roleId];
    if (!roleMeta) return;
    const assignment = roles[roleId];
    const model = modelMap.get(String(assignment?.modelId || ""));
    const variant = model?.variants?.[0] || {};
    const fallbackRouteIds = [];
    for (const fallbackRoleId of fallbackRoleIds) {
      const fallbackMeta = modelCenterRoleMeta[fallbackRoleId];
      if (fallbackMeta && roles[fallbackRoleId]?.modelId && roles[fallbackRoleId]?.modelId !== assignment?.modelId) fallbackRouteIds.push(fallbackMeta.routeId);
    }
    for (const fallbackModelId of model?.fallbackChain || []) {
      const fallbackRouteId = routeIdForModel(modelMap.get(fallbackModelId));
      if (fallbackRouteId) fallbackRouteIds.push(fallbackRouteId);
    }
    routes.push({
      id: roleMeta.routeId,
      modelName: roleMeta.routeId,
      label: `${roleMeta.label}: ${model?.label || "Unassigned"}`,
      provider: normalizeRouteProvider(model?.providerId || ""),
      dataBoundary: model?.dataBoundary || "local",
      targetModel: variant.externalId || model?.id || "",
      description: roleMeta.description,
      available: Boolean(model),
      default: roleId === "chatPrimary",
      capabilities: model?.capabilities || [],
      contextWindow: variant.contextWindow || null,
      fallbackRouteIds: uniqueStrings(fallbackRouteIds),
    });
  };

  addRoleRoute("chatPrimary", ["chatFallback"]);
  addRoleRoute("chatFallback");
  addRoleRoute("taskRouting");
  addRoleRoute("agentDefault");

  const localDefaultModel = modelMap.get(localEngineDefaultId || roles.chatPrimary?.modelId || "");
  if (localDefaultModel) {
    const variant = localDefaultModel.variants?.[0] || {};
    routes.push({
      id: "local/default",
      modelName: "local/default",
      label: `Local default: ${localDefaultModel.label}`,
      provider: normalizeRouteProvider(localDefaultModel.providerId),
      dataBoundary: "local",
      targetModel: variant.externalId || localDefaultModel.id,
      description: "Direct route to the current local default model.",
      available: true,
      capabilities: localDefaultModel.capabilities || [],
      contextWindow: variant.contextWindow || null,
      fallbackRouteIds: [],
    });
  }

  if (includeDirectRoutes) {
    for (const model of models) addDirectRoute(model);
  }

  return dedupeRoutes(routes);
}

export function dedupeRoutes(routes = []) {
  const map = new Map();
  for (const route of routes) {
    if (!route?.id) continue;
    map.set(route.id, route);
  }
  const validIds = new Set(map.keys());
  return [...map.values()].map((route) => ({
    ...route,
    fallbackRouteIds: uniqueStrings(route.fallbackRouteIds).filter((routeId) => routeId !== route.id && validIds.has(routeId)),
  }));
}

export function providerRoutePrefix(providerId = "") {
  switch (providerId) {
    case "ollama":
      return "Local";
    case "telnyx":
      return "Telnyx";
    case "managed-gateway":
      return "Managed";
    case "anthropic":
      return "Anthropic";
    default:
      return "Model";
  }
}

export function normalizeRouteProvider(providerId = "") {
  switch (providerId) {
    case "ollama":
      return "local";
    case "telnyx":
      return "telnyx";
    case "managed-gateway":
      return "managed-telnyx";
    case "anthropic":
      return "anthropic";
    default:
      return providerId || "local";
  }
}

export function inferDataBoundary(providerId = "", engineId = "") {
  if (providerId === "telnyx" || providerId === "managed-gateway") return "telnyx-cloud";
  if (providerId === "anthropic") return "frontier-byo";
  if (engineId === "ollama" || providerId === "ollama") return "local";
  return "local";
}

function normalizeRoleAssignment(input, roleId) {
  return {
    roleId,
    modelId: String(input?.modelId || ""),
    updatedAt: String(input?.updatedAt || ""),
  };
}

function normalizeProviderConfigMap(input = {}) {
  return {
    telnyx: {
      enabled: input.telnyx?.enabled !== false,
      baseUrl: String(input.telnyx?.baseUrl || ""),
      defaultModelId: String(input.telnyx?.defaultModelId || ""),
    },
    "managed-gateway": {
      enabled: Boolean(input["managed-gateway"]?.enabled),
      baseUrl: String(input["managed-gateway"]?.baseUrl || ""),
      defaultModelId: String(input["managed-gateway"]?.defaultModelId || ""),
    },
    anthropic: {
      enabled: Boolean(input.anthropic?.enabled),
      baseUrl: String(input.anthropic?.baseUrl || ""),
      defaultModelId: String(input.anthropic?.defaultModelId || ""),
    },
  };
}

function normalizeEngineConfigMap(input = {}) {
  return {
    ollama: {
      enabled: input.ollama?.enabled !== false,
      baseUrl: String(input.ollama?.baseUrl || ""),
      defaultModelId: String(input.ollama?.defaultModelId || ""),
      checkForUpdates: input.ollama?.checkForUpdates !== false,
      verifyDependencies: input.ollama?.verifyDependencies !== false,
      maxLoadedModels: Math.max(0, Math.round(Number(input.ollama?.maxLoadedModels || 1))),
      timeoutSeconds: Math.max(30, Math.round(Number(input.ollama?.timeoutSeconds || 600))),
    },
  };
}

function clampPort(input, fallback) {
  const value = Math.round(Number(input || fallback));
  return Number.isFinite(value) && value > 0 && value <= 65535 ? value : fallback;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function uniqueStrings(values) {
  return [...new Set(Array.isArray(values) ? values.map((value) => String(value || "").trim()).filter(Boolean) : [])];
}

function formatGiB(bytes) {
  return `${(bytes / gib).toFixed(bytes >= 10 * gib ? 0 : 1)} GB`;
}
