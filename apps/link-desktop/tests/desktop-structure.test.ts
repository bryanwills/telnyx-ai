import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop package exposes expected local scripts", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
    overrides: Record<string, string>;
  };

  assert.equal(pkg.scripts.dev, "node scripts/dev.mjs");
  assert.equal(pkg.scripts.build, "vite build");
  assert.equal(pkg.scripts["metadata:check"], "scripts/check-service-metadata.sh");
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts.test, "tsx --test tests/*.test.ts");
  assert.equal(pkg.overrides.uuid, "^11.1.1");
});

test("desktop app carries PADR service metadata", async () => {
  const meta = await readFile("meta-dev.yml", "utf8");
  const metadataScript = await readFile("scripts/check-service-metadata.sh", "utf8");
  const readme = await readFile("README.md", "utf8");

  assert.match(meta, /names:\n\s+service:\s+link-desktop\n\s+github:\s+team-telnyx-ai/);
  assert.match(meta, /project:\n\s+squad:\s+ai-fde\.squad\n\s+primary_maintainer:\s+pete/);
  assert.match(meta, /public_api:\s+false/);
  assert.match(meta, /private_api:\s+false/);
  assert.match(meta, /processes_pii:\s+true/);
  assert.match(meta, /service_type:\s+frontend/);
  assert.doesNotMatch(meta, /deploy:/);
  assert.doesNotMatch(meta, /alerts:/);
  assert.match(metadataScript, /infra-svc-metatool\.query\.consul:8080/);
  assert.match(metadataScript, /action=check/);
  assert.match(metadataScript, /metadev=@\$APP_DIR\/meta-dev\.yml/);
  assert.match(readme, /npm run metadata:check/);
  assert.match(readme, /PADR-1 Service Metadata Specification/);
});

test("vite builds relative assets for Electron file loading", async () => {
  const viteConfig = await readFile("vite.config.ts", "utf8");

  assert.match(viteConfig, /base:\s*["']\.\/["']/);
});

test("Electron windows follow the internal app security baseline", async () => {
  const main = await readFile("src/main/main.js", "utf8");
  const index = await readFile("index.html", "utf8");

  assert.match(main, /preload:\s*path\.join\(__dirname,\s*"preload\.cjs"\)/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /allowRunningInsecureContent:\s*false/);
  assert.match(main, /webviewTag:\s*false/);
  assert.doesNotMatch(main, /sandbox:\s*false/);
  assert.doesNotMatch(main, /nodeIntegration:\s*true/);
  assert.doesNotMatch(main, /webSecurity:\s*false/);
  assert.doesNotMatch(main, /allowRunningInsecureContent:\s*true/);
  assert.doesNotMatch(main, /webviewTag:\s*true/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /setPermissionCheckHandler/);
  assert.match(main, /trustedRendererWebContentsIds\.has\(webContents\.id\) && mediaPermissionNames\.has\(permission\)/);
  assert.match(main, /oktaFastPassLocalAppPermissionNames/);
  assert.match(main, /local-network-access/);
  assert.match(main, /isAllowedOktaFastPassPermissionRequest/);
  assert.match(main, /isAllowedOktaFastPassPermissionCheck/);
  assert.match(main, /details\?\.embeddingOrigin/);
  assert.match(main, /return originInputs\.some\(isTrustedOktaAuthOrigin\)/);
  assert.match(main, /registerTrustedRendererWindow\(win\)/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /will-navigate/);
  assert.match(main, /checkedRendererDevServerUrl/);
  assert.match(main, /isLoopbackHostname/);
  assert.match(main, /shell\.openExternal/);
  assert.match(index, /Content-Security-Policy/);
  assert.match(index, /object-src 'none'/);
  assert.match(index, /frame-src 'none'/);
  assert.match(index, /form-action 'none'/);
});

test("main-process privileged entrypoints fail closed", async () => {
  const main = await readFile("src/main/main.js", "utf8");

  assert.match(main, /function secureIpcHandle/);
  assert.match(main, /assertTrustedIpcSender\(event\)/);
  assert.match(main, /trustedRendererWebContentsIds\.has\(event\.sender\.id\)/);
  assert.match(main, /Rejected IPC from an untrusted renderer/);
  assert.doesNotMatch(main, /ipcMain\.handle\("link:/);
  assert.match(main, /const allowedCliCommands = new Set\(\["hermes", "openclaw"\]\)/);
  assert.match(main, /allowedCliCommands\.has\(executable\)/);
  assert.match(main, /execFileAsync\(executable, Array\.isArray\(args\) \? args\.map\(String\) : \[\]/);
  assert.match(main, /link:publisher-list-apps/);
  assert.match(main, /link:publisher-create-intent/);
  assert.match(main, /link:publisher-review-app/);
  assert.match(main, /link:publisher-duplicate-app/);
  assert.match(main, /link:publisher-open-app/);
  assert.match(main, /linkAppAllowedHostSuffixes/);
  assert.match(main, /isAllowedLinkAppUrl/);
  assert.match(main, /Refusing to open a non-approved Link app URL/);
  assert.match(main, /\/publish-intents/);
  assert.doesNotMatch(main, /allowedCliCommands = new Set\(\[[\s\S]*telnyx-edge/);
});

test("preload exposes the Link desktop IPC contract", async () => {
  const preload = await readFile("src/main/preload.cjs", "utf8");

  assert.match(preload, /require\("electron"\)/);
  for (const method of [
    "chat",
    "runSkill",
    "listSkills",
    "listTools",
    "createSharedChannelDraft",
    "listActiveWork",
    "decideWork",
    "listAutomations",
    "listConnectors",
    "listCredentials",
    "saveCredential",
    "updateConnectorStatus",
    "listWidgetCatalog",
    "listWidgetLayout",
    "saveWidgetLayout",
    "refreshWidgetData",
    "listOnboarding",
    "updateOnboarding",
    "signInAgentControlPlane",
    "signOutAgentControlPlane",
    "getAgentControlPlaneAuthStatus",
    "listHostedAgents",
    "listWorkspaces",
    "searchExplorer",
    "listChatSessions",
    "sendChatMessage",
    "renameChatSession",
    "transcribeAudio",
    "createChangeRequest",
    "approveChangeRequest",
    "dismissChangeRequest",
    "listChangeRequests",
    "listAgents",
    "sendAgentMessage",
    "listWorkboard",
    "createWorkboardCard",
    "updateWorkboardCard",
    "dispatchWorkboard",
    "listAccountPhoneNumbers",
    "listMemoryBanks",
    "recallMemory",
    "listDojoState",
    "listPublishedApps",
    "createPublishIntent",
    "createPublishedAppVersion",
    "reviewPublishedApp",
    "duplicatePublishedApp",
    "openPublishedApp",
    "auditEvents",
  ]) {
    assert.match(preload, new RegExp(`${method}:`));
  }
});

test("renderer includes canonical Link pages in the primary navigation", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  for (const view of ["widgets", "chats", "agents", "workboard", "phone", "calendar", "dojo"]) {
    assert.match(app, new RegExp(`id: "${view}"`));
  }
  assert.doesNotMatch(app, /const navItems:[\s\S]*?id: "memory"/);
  assert.doesNotMatch(app, /id: "connections"/);
  assert.doesNotMatch(app, /id: "marketplace"/);
  assert.doesNotMatch(app, /id: "skills"/);
  assert.doesNotMatch(app, /id: "workspaces"/);
  assert.doesNotMatch(app, /id: "design"/);
  assert.doesNotMatch(app, /view === "design"/);
  assert.match(app, /useState<ViewId>\("widgets"\)/);
  assert.ok(app.indexOf('id: "widgets"') < app.indexOf('id: "workboard"'));
  assert.ok(app.indexOf('id: "workboard"') < app.indexOf('id: "chats"'));
  assert.ok(app.indexOf('id: "chats"') < app.indexOf('id: "phone"'));
  assert.ok(app.indexOf('id: "phone"') < app.indexOf('id: "calendar"'));
  assert.ok(app.indexOf('id: "calendar"') < app.indexOf('id: "agents"'));
  assert.doesNotMatch(app, /\{ id: "memory", label: "Archive", icon: ArchiveIcon \},\n\s*\{ id: "dojo"/);
  assert.match(app, /agents:\s*\{\s*label:\s*"Agents",\s*icon:\s*Bot\s*\}/);
  assert.match(app, /chats:\s*\{\s*label:\s*"Chat",\s*icon:\s*MessageSquare\s*\}/);
  assert.match(app, /phone:\s*\{\s*label:\s*"Phone",\s*icon:\s*Phone\s*\}/);
  assert.match(app, /calendar:\s*\{\s*label:\s*"Calendar",\s*icon:\s*CalendarDays\s*\}/);
  assert.match(app, /workboard:\s*\{\s*label:\s*"Tasks",\s*icon:\s*SquareCheck\s*\}/);
  assert.match(app, /<span className="railIconSlot"><Icon size=\{17\} \/><\/span>/);
  assert.match(styles, /\.railIconSlot\s*\{[\s\S]*?width:\s*18px[\s\S]*?height:\s*18px/);
  assert.match(styles, /\.brandButton \.railIconSlot\s*\{[\s\S]*?width:\s*24px[\s\S]*?height:\s*24px/);
  assert.doesNotMatch(app, /marketplace:\s*\{\s*label:\s*"App Marketplace",\s*icon:\s*Store\s*\}/);
  assert.doesNotMatch(app, /view === "marketplace"/);
  assert.doesNotMatch(app, /\{ id: "explorer", label: "Library", icon: BookOpen \}/);
  assert.doesNotMatch(app, /SidebarSection title="Library"/);
  assert.doesNotMatch(app, /connections:\s*\{\s*label:\s*"Agent Plugins",\s*icon:\s*Link2\s*\}/);
  assert.doesNotMatch(app, /Request access/);
  assert.match(app, /memory:\s*\{\s*label:\s*"Archive",\s*icon:\s*ArchiveIcon\s*\}/);
  assert.doesNotMatch(app, /Hindsight infers the selected memory bank from the configured API key/);
  assert.doesNotMatch(app, /Memory bank scope/);
  assert.match(app, /dojo:\s*\{\s*label:\s*"Experto",\s*icon:\s*ChessKnight\s*\}/);
  assert.doesNotMatch(app, /function TabStrip/);
  assert.doesNotMatch(app, /className="tabStrip"/);
});

test("signed out users only see the Okta auth gate", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(app, /const signedIn = Boolean\(accountStatus\?\.ready && !signedOutLocally\)/);
  assert.match(app, /!\s*signedIn \? \(/);
  assert.match(app, /<AuthGate/);
  assert.match(app, /function AuthGate/);
  assert.match(app, /bring your agents, tasks, calls, calendar, docs, and internal tools into one secure workspace/);
  assert.match(app, /Sign in with Okta/);
  assert.match(app, /<img src="\.\/triforce-26\.png" alt="" aria-hidden="true" \/>/);
  assert.match(app, /\{signedIn && memoryOpen && <MemoryModal/);
  assert.match(styles, /\.authGate\s*{/);
  assert.match(styles, /\.authGateCard\s*{/);
  assert.match(styles, /\.authGateIcon\s*\{[\s\S]*?border:\s*1px solid var\(--border\)[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.authGateIcon img\s*\{/);
});

test("Experto owns the skills catalog and squad kits", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(app, /function DojoView/);
  assert.match(app, /Experto/);
  assert.match(app, /ChessKnight/);
  assert.match(app, /<header className="pageHeader">[\s\S]*?<h1>Experto Crede<\/h1>/);
  assert.doesNotMatch(app, /label:\s*"Dojo"/);
  assert.doesNotMatch(app, />Dojo</);
  assert.doesNotMatch(app, /dojoHeader/);
  assert.doesNotMatch(app, /dojoCard/);
  assert.doesNotMatch(app, /Start training/);
  assert.doesNotMatch(app, /skills mastered/);
  assert.match(app, /squadKits/);
  assert.match(app, /Search skills/);
  assert.doesNotMatch(app, /Run selected/);
  assert.match(app, /useState<"skills" \| "squads" \| "apps" \| "support" \| "developers" \| "wiki">\("skills"\)/);
  assert.match(app, /aria-label="Experto sections"/);
  assert.match(app, /\["skills", "Skills", Zap\]/);
  assert.match(app, /\["squads", "Squads", Users\]/);
  assert.match(app, /\["apps", "Apps", Store\]/);
  assert.match(app, /\["support", "Help Center", BookOpen\]/);
  assert.match(app, /\["developers", "Developer Docs", FileText\]/);
  assert.match(app, /\["wiki", "Guru Wiki", BookOpen\]/);
  assert.match(app, /Publish from local bot/);
  assert.match(app, /function startPublishing\(option/);
  assert.doesNotMatch(app, /Start publishing/);
  assert.match(app, /<h1>Experto Crede<\/h1>/);
  assert.match(app, /activeAgent/);
  assert.match(app, /expertoHeaderActions/);
  assert.match(app, /Agent: \$\{activeAgent\.displayName\}/);
  assert.match(app, /Choose agent/);
  assert.doesNotMatch(app, /Publish skills for Telnyx teams/);
  assert.doesNotMatch(app, /Installing to/);
  assert.doesNotMatch(app, /activeAgentInstallBanner/);
  assert.match(app, /installSkill\(skill\)/);
  assert.match(app, /telnyx-link-installed-agent-skills/);
  assert.match(app, /Choose an active agent on Agents > My Agents before installing skills/);
  assert.match(app, /function renderSquadsTab/);
  assert.match(app, /const \[filter, setFilter\]/);
  assert.match(app, /const \[sort, setSort\]/);
  assert.match(app, /dojoFilterButton/);
  assert.match(app, /dojoSelectField/);
  assert.match(app, /Search squads or skills\.\.\./);
  assert.match(app, /<h2>Your squads<\/h2>/);
  assert.match(app, /<h2>Squad Skills<\/h2>/);
  assert.doesNotMatch(app, /Squad kits/);
  assert.match(app, /dojoSectionHeading/);
  assert.match(app, /dojoSkillList/);
  assert.match(app, /toggleSquadKit/);
  assert.match(app, /void runSkill\(skill\)/);
  assert.match(app, /function renderAppsTab/);
  assert.match(app, /filteredApps\.map/);
  assert.match(app, /externalQuery=\{query\}/);
  assert.match(app, /externalSort=\{sort\}/);
  assert.match(app, /function ExplorerView\(\{/);
  assert.match(app, /ExplorerSourceTab = "support" \| "developers" \| "wiki" \| "local"/);
  assert.match(app, /Help Center/);
  assert.match(app, /Developer Docs/);
  assert.match(app, /Company Wiki powered by Guru/);
  assert.match(app, /Suggest improvement/);
  assert.match(app, /docSourcesOnly/);
  assert.match(app, /docsSetupState/);
  assert.match(app, /No results found/);
  assert.match(app, /embeddedExplorerView/);
  assert.match(styles, /\.expertoTabs\s*{/);
  assert.match(styles, /\.embeddedExplorerView\s*{/);
  assert.match(styles, /\.explorerSourceTabs\s*{/);
  assert.match(styles, /\.explorerSourceHeader\s*{/);
  assert.match(styles, /\.explorerResultActions\s*{/);
  assert.doesNotMatch(app, /Shirt/);
  assert.doesNotMatch(app, /skills from the Telnyx skills registry/);
  assert.match(app, /squadKitColumns/);
  assert.match(app, /squadKitSkillList/);
  assert.match(app, /function MarketplaceView\(\{ embedded = false, hideHeader = false \}/);
  assert.match(await readFile("../../tools/link/skills/make-html-slides.md", "utf8"), /name: Make HTML Slides/);
  const outboundProspectingSkill = await readFile("../../tools/link/skills/outbound-prospecting-mcp.md", "utf8");
  assert.match(outboundProspectingSkill, /name: Outbound Prospecting MCP/);
  assert.match(outboundProspectingSkill, /team: Sales/);
  assert.match(outboundProspectingSkill, /language: mcp/);
  assert.match(outboundProspectingSkill, /approval_required: true/);
  assert.doesNotMatch(app, /view === "skills"/);
  assert.match(styles, /\.squadKitColumns\s*{/);
  assert.match(styles, /\.squadKitColumns\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.dojoSectionHeading h2\s*\{[\s\S]*?font-size:\s*18px/);
  assert.doesNotMatch(styles, /\.centeredLabel\s*{/);
  assert.match(styles, /\.squadKitHeader\s*\{[\s\S]*?min-height:\s*54px/);
  assert.match(styles, /\.squadKitHeader strong\s*\{[\s\S]*?font-size:\s*14px/);
  assert.match(styles, /\.squadKitSkillList\s*{/);
  assert.doesNotMatch(styles, /\.publishSkillsPanel\s*{/);
  assert.match(styles, /\.expertoHeaderActions\s*{/);
  assert.match(styles, /\.dojoToolbar\s*\{[\s\S]*?grid-template-columns:\s*44px minmax\(260px,\s*1fr\) 112px/);
  assert.match(styles, /\.dojoSelectField\s*{/);
  assert.match(styles, /\.dojoSkillList\s*{/);
  assert.doesNotMatch(styles, /\.activeAgentInstallBanner\s*{/);
  assert.match(styles, /\.skillCardActions\s*{/);
});

test("archive page mirrors memory sections without integration naming", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const main = await readFile("src/main/main.js", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(app, /Archive/);
  assert.match(app, /Refresh archive/);
  for (const label of ["Documents", "Entries", "Entities", "Prompt", "Settings"]) {
    assert.match(app, new RegExp(label));
  }
  assert.doesNotMatch(app, /label:\s*"Overview"/);
  assert.doesNotMatch(app, /tab === "overview"/);
  assert.match(app, /type ArchiveTabId = "documents" \| "memories" \| "entities" \| "prompt" \| "settings"/);
  assert.match(app, /function ArchiveTabs/);
  assert.match(app, /<ArchiveTabs banks=\{banks\} openMemory=\{openMemory\} \/>/);
  assert.doesNotMatch(app, /label:\s*"API Keys"/);
  assert.doesNotMatch(app, />Console</);
  assert.match(app, /role="tablist" aria-label="Archive sections"/);
  assert.doesNotMatch(app, /Hindsight credentials/);
  assert.doesNotMatch(app, /Hindsight not connected/);
  assert.doesNotMatch(app, /No Hindsight matches/);
  assert.doesNotMatch(app, /Hindsight responded successfully/);
  assert.match(main, /name:\s*"Key-scoped archive"/);
  assert.doesNotMatch(main, /Hindsight key-scoped memory/);
  assert.match(app, /Upload files/);
  assert.match(app, /Quick add text/);
  assert.match(app, /Min mentions/);
  assert.match(app, /Retain/);
  assert.match(app, /Recall/);
  assert.match(app, /Reflect/);
  assert.match(styles, /\.archiveTabsSurface/);
  assert.match(styles, /\.memoryTabs/);
  assert.match(styles, /\.memoryTable/);
});

test("onboarding is persisted, dismissible, and tied to setup steps", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const main = await readFile("src/main/main.js", "utf8");
  const preload = await readFile("src/main/preload.cjs", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(api, /OnboardingState/);
  assert.match(api, /listOnboarding/);
  assert.match(api, /updateOnboarding/);
  assert.match(main, /onboardingState/);
  assert.match(main, /emptyOnboardingState/);
  assert.match(main, /link:list-onboarding/);
  assert.match(app, /function OnboardingView/);
  assert.match(app, /initialOnboardingState/);
  assert.match(app, /useState<OnboardingState>\(initialOnboardingState\)/);
  assert.match(app, /Dismiss onboarding/);
  assert.match(app, /Register with Telnyx Okta/);
  assert.match(app, /Set up Agent Plugins/);
  assert.match(app, /Connect the accounts and plugin permissions Link can use/);
  assert.match(app, /Attach the squad archive/);
  assert.match(app, /Finish onboarding/);
  assert.doesNotMatch(app, /Training sessions/);
  assert.doesNotMatch(app, /trainingGrid/);
  assert.doesNotMatch(styles, /\.trainingGrid/);
  assert.match(app, /onboarding:\s*\{\s*label:\s*"Onboarding",\s*icon:\s*Flag\s*\}/);
  assert.match(app, /\{renderRailButton\(\{ id: "onboarding", label: "Start", icon: Flag \}\)\}/);
  assert.doesNotMatch(app, /\{renderRailButton\(\{ id: "memory", label: "Archive", icon: ArchiveIcon \}\)\}/);
  assert.match(app, /\{renderRailButton\(\{ id: "settings", label: "Settings", icon: Settings \}\)\}/);
  assert.match(styles, /\.railOnboardingItem/);
  assert.match(styles, /\.railDismiss\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.railDismiss:hover,[\s\S]*?background:\s*var\(--surface-soft\)/);
  assert.match(styles, /\.onboardingGrid/);
});

test("widgets page exposes a report library for the home dashboard", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(app, /function WidgetsView/);
  assert.match(app, /libraryOpen:\s*boolean/);
  assert.match(app, /widgetCatalog/);
  assert.match(app, /listWidgetCatalog/);
  assert.match(app, /saveWidgetLayout/);
  assert.match(app, /refreshWidgetData/);
  assert.match(app, /WidgetChart/);
  assert.match(app, /ResizeObserver/);
  assert.match(app, /LineChart/);
  assert.match(app, /BarChart/);
  assert.match(app, /AreaChart/);
  assert.match(app, /No authorized Tableau widgets/);
  assert.match(app, /Search reports/);
  assert.match(app, /Add widget/);
  assert.match(app, /Widget library/);
  assert.match(app, /layoutEditing/);
  assert.match(app, /aria-pressed=\{layoutEditing\}/);
  assert.match(app, />\s*Manage layout\s*</);
  assert.match(app, /layoutEditing && \(/);
  assert.match(app, />\s*Done\s*</);
  assert.doesNotMatch(app, /Home view/);
  assert.doesNotMatch(app, /Personal report snapshots/);
  assert.match(app, /startWidgetDrag/);
  assert.match(app, /allowWidgetDrop/);
  assert.match(app, /dropWidget/);
  assert.match(app, /draggable=\{layoutEditing\}/);
  assert.match(app, /libraryOpen \? \(/);
  assert.match(styles, /\.widgetsView \.headerActions\s*{[^}]*margin-top:\s*4px/s);
  assert.match(styles, /\.widgetLibraryTakeover\s*{/);
  assert.match(styles, /\.widgetLibraryControls\s*{[^}]*grid-template-columns:\s*minmax\(260px,\s*1fr\) minmax\(320px,\s*420px\)/s);
  assert.match(styles, /\.widgetLibraryList\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(220px,\s*1fr\)\)/s);
  assert.match(styles, /\.dashboardWidgetGrid\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(220px,\s*1fr\)\)/s);
  assert.match(styles, /@keyframes widgetJiggle/);
  assert.match(styles, /\.dashboardWidgetGrid\.layoutEditing \.dashboardWidget/);
  assert.match(styles, /\.dashboardWidgetGrid\.layoutEditing \.dashboardWidget\.dropTarget/);
  assert.match(styles, /\.widgetDataState/);
  assert.match(styles, /\.spinning/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});

test("app marketplace uses the managed Link App Publisher catalog", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const main = await readFile("src/main/main.js", "utf8");

  assert.doesNotMatch(app, /id: "marketplace"/);
  assert.match(app, /function MarketplaceView/);
  assert.match(app, /embeddedMarketplace/);
  assert.match(app, /publishedApps/);
  assert.match(api, /interface LinkPublishedApp/);
  assert.match(main, /Link App Publisher/);
  assert.match(main, /POST/);
  assert.match(main, /\/apps\/\$\{encodeURIComponent\(appId\)\}\/versions/);
  assert.match(main, /\/apps\/\$\{encodeURIComponent\(appId\)\}\/reviews/);
  assert.match(main, /\/apps\/\$\{encodeURIComponent\(appId\)\}\/duplicate/);
  assert.match(app, /App Marketplace/);
  assert.match(app, /publishMenuOpen/);
  assert.match(app, /Publish from local bot/);
  assert.match(app, /Submit a private app to the managed publisher/);
  assert.match(app, /function renderPublishAppPanel/);
  assert.match(app, /linkApi\.createPublishIntent/);
  assert.match(app, /linkApi\.openPublishedApp/);
  assert.match(app, /linkApi\.duplicatePublishedApp/);
  assert.match(app, /linkApi\.reviewPublishedApp/);
  assert.match(app, /Publish a reusable bot skill/);
  assert.match(app, /Share a local bot page/);
  assert.match(app, /Publish a scheduled workflow/);
  assert.match(app, /aria-haspopup="menu"/);
  assert.match(app, /role="menuitem"/);
  assert.match(app, /Open VPN/);
  assert.match(app, /Duplicate/);
  assert.match(app, /Approve/);
  assert.match(app, /Reject/);
  assert.match(app, /Source repo/);
  assert.match(app, /Owner squad/);
  assert.match(app, /Env schema/);
  assert.doesNotMatch(app, /Install locally/);
  assert.doesNotMatch(app, /Publish an app for Telnyx employees/);
  assert.doesNotMatch(app, /bot-owned workflow/);
  assert.doesNotMatch(app, /Employee apps/);
  assert.doesNotMatch(app, /Installed locally/);
  assert.doesNotMatch(app, /Apps already available on this device/);
  assert.doesNotMatch(styles, /\.marketplaceSummary/);
  assert.doesNotMatch(styles, /\.marketplacePublish/);
  assert.match(styles, /\.publisherPanel\s*{/);
  assert.match(styles, /\.publisherForm\s*{/);
  assert.match(styles, /\.publisherSource\s*{/);
  assert.match(styles, /\.publishMenu\s*{/);
  assert.match(styles, /\.publishMenuHeader\s*{/);
  assert.match(styles, /\.publishMenu button\s*{/);
  assert.match(styles, /\.marketplaceGrid\s*{/);
  assert.match(styles, /\.marketplaceCard\s*{/);
});

test("renderer uses Telnyx media-kit brand colors", async () => {
  const styles = await readFile("src/renderer/styles.css", "utf8");
  const main = await readFile("src/main/main.js", "utf8");
  const app = await readFile("src/renderer/App.tsx", "utf8");

  assert.match(styles, /--telnyx-green:\s*#00e3aa/i);
  assert.match(styles, /--telnyx-black:\s*#000000/i);
  assert.match(styles, /--accent:\s*var\(--telnyx-green\)/);
  assert.match(main, /--accent:\s*#00E3AA/);
  assert.match(app, /Telnyx Green/);
  assert.match(app, /Telnyx Black/);
});

test("page layouts use full-width app canvas", async () => {
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(styles, /\.content\s*{[^}]*padding:\s*14px/s);
  assert.match(styles, /\.content\s*{[^}]*gap:\s*14px/s);
  assert.match(styles, /\.assistantPanel\s*{[^}]*padding:\s*14px/s);
  assert.match(styles, /\.pageHeader\s*{[^}]*margin-bottom:\s*0/s);
  assert.match(styles, /\.appSurface\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*2fr\) minmax\(340px,\s*1fr\)/s);
  assert.match(styles, /\.pageSurface > \.content\s*{[^}]*height:\s*100%/s);
  assert.doesNotMatch(styles, /max-width:\s*(920|940|980)px/);
  assert.doesNotMatch(styles, /min-width:\s*760px/);
  assert.match(styles, /\.phoneSetupGrid,[\s\S]*?width:\s*100%/);
  assert.match(styles, /\.settingsView \.pageHeader,[\s\S]*?width:\s*100%/);
});

test("settings uses tabs for credentials theme and design system", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const main = await readFile("src/main/main.js", "utf8");
  const preload = await readFile("src/main/preload.cjs", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.doesNotMatch(api, /\|\s*"design"/);
  assert.match(app, /setTab\] = useState<"credentials" \| "theme" \| "design">\("credentials"\)/);
  for (const label of ["Credentials", "Link Theme", "Design System"]) {
    assert.match(app, new RegExp(label));
  }
  assert.doesNotMatch(app, /\["troubleshooting", "Troubleshooting"\]/);
  assert.doesNotMatch(app, /tab === "troubleshooting"/);
  assert.doesNotMatch(app, /useState<"my-agents" \| "credentials" \| "troubleshooting" \| "design">/);
  assert.doesNotMatch(app, /\["access", "Access"\]/);
  assert.doesNotMatch(app, /\["plugins", "Agent Plugins"\]/);
  assert.doesNotMatch(api, /connector\("aida", "AIDA", "Agent tools"/);
  assert.match(main, /id:\s*"aida"[\s\S]*?name:\s*"AIDA"[\s\S]*?category:\s*"Agent tools"/);
  assert.match(main, /id:\s*"telnyx-docs"[\s\S]*?name:\s*"Telnyx Docs"[\s\S]*?category:\s*"Knowledge"/);
  assert.doesNotMatch(app, /<span><Users size=\{14\} \/> Hosted agents<\/span>/);
  assert.doesNotMatch(app, /Okta-backed connector/);
  assert.doesNotMatch(app, /\["appearance", "Appearance"\]/);
  assert.match(app, /colorMode,\s*setColorMode/);
  assert.match(app, /data-theme=\{colorMode\}/);
  assert.match(app, /setColorMode\(colorMode === "dark" \? "light" : "dark"\)/);
  assert.match(app, /<DesignSystemView embedded \/>/);
  assert.match(app, /function CredentialSection/);
  assert.match(app, /isRequiredCredentialGroup/);
  assert.match(app, /group\.id !== "agent-control-plane"/);
  assert.match(app, /group\.id !== "mcp-proxy"/);
  assert.match(main, /id:\s*"agent-control-plane",\s*label:\s*"Agent Control Plane"[\s\S]*?fields:\s*\["AUTH_INTERNAL_URL", "TELNYX_AUTH_REV2"\]/);
  assert.match(main, /const loginUrl = authInternalAuthorizationUrl\(callbackServer\.callbackUrl, state\)/);
  assert.match(main, /authWindow\.loadURL\(loginUrl\)/);
  assert.match(main, /title:\s*"Telnyx - Sign In"/);
  assert.match(main, /const authWebContentsIds = new Set\(\)/);
  assert.match(main, /oktaFastPassLocalAppPermissionNames = new Set\(\["local-network-access", "unknown"\]\)/);
  assert.match(main, /authWebContentsIds\.add\(authWebContentsId\)/);
  assert.match(main, /authWebContentsIds\.delete\(authWebContentsId\)/);
  assert.match(main, /function isAllowedOktaFastPassPermission/);
  assert.match(main, /function isTrustedOktaAuthOrigin/);
  assert.match(main, /function openAgentControlPlaneSetup/);
  assert.match(main, /AGENT_CONTROL_PLANE_ADD_AGENT_URL/);
  assert.match(main, /new URL\("\/agents\/new", `\$\{agentControlPlaneUrl\(\)\}\/`\)/);
  assert.match(preload, /openAgentControlPlaneSetup:\s*\(\) => ipcRenderer\.invoke\("link:agent-control-plane-open-setup"\)/);
  assert.doesNotMatch(main, /linkOktaSignInHtml/);
  assert.doesNotMatch(main, /Telnyx internal auth relay/);
  assert.match(api, /credentials\("agent-control-plane", "Agent Control Plane"/);
  assert.doesNotMatch(api, /credentials\("telnyx-okta", "Telnyx Okta"/);
  assert.doesNotMatch(main, /label:\s*"Telnyx Okta"/);
  assert.match(app, /compareCredentialGroups/);
  assert.match(app, /<CredentialSection title="Required" groups=\{requiredCredentials\}>/);
  assert.doesNotMatch(app, /<CredentialSection title="Optional" groups=\{optionalCredentials\}>/);
  assert.match(styles, /\.credentialCard\.expanded\s*\{[\s\S]*?box-shadow:\s*none/);
  assert.match(styles, /\.credentialSummary:focus\s*\{[\s\S]*?outline:\s*0/);
  assert.match(app, /function CredentialGroupCards/);
  assert.match(app, /groups=\{requiredCredentials\}/);
  assert.match(app, /setGroups=\{setCredentials\}/);
  assert.match(app, /credentialFieldLabel/);
  assert.match(app, /if \(name === "LITELLM_API_KEY"\) return "LiteLLM API Key"/);
  assert.match(app, /https:\/\/telnyx\.enterprise\.slack\.com\/archives\/D0995UB1PLY/);
  assert.match(app, />\s*AI-swe-Agent\s*<\/a>/);
  assert.match(main, /id:\s*"litellm"[\s\S]*?fields:\s*\["LITELLM_API_KEY"\]/);
  assert.match(api, /credentials\("litellm", "Telnyx LiteLLM"[\s\S]*?\["LITELLM_API_KEY"\]\)/);
  assert.doesNotMatch(main, /fields:\s*\["LITELLM_API_KEY", "LITELLM_MODEL"\]/);
  assert.doesNotMatch(api, /\["LITELLM_API_KEY", "LITELLM_MODEL"\]/);
  assert.doesNotMatch(app, /\{missingCount\} missing/);
  assert.doesNotMatch(app, /Saved values are write-only and encrypted in Electron secure storage/);
  assert.doesNotMatch(app, /<Badge tone=\{field\.configured \? "success" : "warning"\}>\{field\.source\}<\/Badge>/);
  assert.match(app, /credentialSavedBadge/);
  assert.match(styles, /\.credentialSavedBadge\s*\{[\s\S]*?background:\s*var\(--surface-soft\)/);
  assert.doesNotMatch(app, /groups\.length === 1 \? "entry" : "entries"/);
  assert.doesNotMatch(app, /messageTroubleshootingBot/);
  assert.doesNotMatch(app, /Run Doctor/);
  assert.match(styles, /\.settingsTabs\s*{/);
  assert.match(styles, /\.credentialSectionHeader\s*{/);
  assert.doesNotMatch(styles, /\.credentialSectionHeader small\s*{/);
  assert.match(styles, /\.accessCard p\s*\{[\s\S]*?white-space:\s*normal/);
  assert.match(styles, /\.credentialSummaryText small\s*\{[\s\S]*?white-space:\s*normal/);
  assert.match(styles, /\.connectorBody p,[\s\S]*?white-space:\s*normal/);
  assert.match(styles, /\.themeToggle\s*{/);
  assert.match(styles, /\.desktop\[data-theme="dark"\]/);
  assert.match(styles, /\.desktop\[data-theme="dark"\] \.widgetsView/);
  assert.match(styles, /\.desktop\[data-theme="dark"\] \.assistantPanel \.button/);
  assert.match(styles, /\.desktop\[data-theme="dark"\] \.widgetCanvas/);
  assert.match(styles, /\.desktop\[data-theme="dark"\] \.workboardLayoutToggle/);
  assert.match(styles, /\.desktop\[data-theme="dark"\] \.workboardLayoutToggle button\.active\s*\{[\s\S]*?color:\s*#151515;[\s\S]*?background:\s*#f4f1ec/);
  assert.match(styles, /\.desktop\[data-theme="dark"\] \.chatReviewTabs button\.selected/);
});

test("user avatar opens an account menu with identity and logout", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const main = await readFile("src/main/main.js", "utf8");
  const preload = await readFile("src/main/preload.cjs", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(api, /signOutAgentControlPlane/);
  assert.match(preload, /link:agent-control-plane-sign-out/);
  assert.match(main, /function signOutAgentControlPlane/);
  assert.match(main, /session\.defaultSession\.cookies\.remove/);
  assert.match(app, /accountMenuOpen/);
  assert.match(app, /accountMenuRef/);
  assert.match(app, /document\.addEventListener\("mousedown", handleOutsideClick\)/);
  assert.match(app, /accountMenuRef\.current\?\.contains\(event\.target as Node\)/);
  assert.match(app, /accountStatus\?\.userName/);
  assert.match(app, /accountStatus\?\.avatarUrl/);
  assert.match(app, /const accountAvatar = accountAvatarUrl \? <img src=\{accountAvatarUrl\}/);
  assert.match(app, /initialsFromIdentity/);
  assert.match(api, /userName\?: string/);
  assert.match(api, /avatarUrl\?: string/);
  assert.match(main, /TELNYX_AUTH_USER_NAME/);
  assert.match(main, /function slackProfileImageUrl/);
  assert.match(main, /users\.lookupByEmail/);
  assert.match(app, /accountAuthButton/);
  assert.match(app, /\{signedIn \? "Sign out" : "Sign in"\}/);
  assert.doesNotMatch(app, /Account settings/);
  assert.doesNotMatch(app, /Open assistant/);
  assert.doesNotMatch(styles, /\.avatar span\s*{/);
  assert.doesNotMatch(app, /<BookOpen size=\{14\} \/>[\s\S]*?Sign in with Okta/);
  assert.doesNotMatch(app, /accountMenuTheme/);
  assert.match(app, /\["theme", "Link Theme", Sun\]/);
  assert.match(app, /themeSettingsCard/);
  assert.match(app, /aria-label=\{colorMode === "dark" \? "Switch to light mode" : "Switch to dark mode"\}/);
  assert.match(app, /setRailExpanded\(!railExpanded\)/);
  assert.match(app, /<span className="themeSettingsRowLabel">[\s\S]*?<span className="accessIcon">[\s\S]*?<PanelLeftOpen size=\{18\}/);
  assert.match(app, /Switch to dark mode/);
  assert.doesNotMatch(app, /Okta session active/);
  assert.match(styles, /\.accountMenu\s*{/);
  assert.match(styles, /\.accountAuthButton\s*{/);
  assert.match(styles, /\.themeSettingsCard\s*{/);
  assert.match(styles, /\.settingsToggle\s*{/);
  assert.match(styles, /\.themeSettingsRow\s*{/);
  assert.match(styles, /\.themeSettingsRow\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.themeSettingsRowLabel > span:last-child\s*\{[\s\S]*?align-items:\s*center/);
  assert.match(styles, /\.avatar img,[\s\S]*?\.accountAvatar img\s*\{[\s\S]*?object-fit:\s*cover/);
});

test("chat and phone stay available in the persistent assistant panel", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const main = await readFile("src/main/main.js", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(api, /export interface ChatArtifact/);
  assert.match(main, /function createChatArtifacts/);
  assert.match(app, /selectedArtifact/);
  assert.match(app, /function ArtifactViewer/);
  assert.match(app, /function MessageArtifacts/);
  assert.match(app, /openArtifact=\{setSelectedArtifact\}/);
  assert.match(app, /function AssistantPanel/);
  assert.match(app, /speechRecognitionConstructor/);
  assert.match(app, /MediaRecorder/);
  assert.match(app, /startRecordedVoiceInput/);
  assert.match(app, /linkApi\.transcribeAudio/);
  assert.match(api, /transcribeAudio\(input: VoiceTranscriptionInput\)/);
  assert.match(main, /link:voice-transcribe/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /\/audio\/transcriptions/);
  assert.match(app, /className=\{`iconButton voiceInputButton/);
  assert.match(app, /<Mic size=\{17\}/);
  assert.match(app, /className="assistantComposerSubmit"/);
  assert.match(app, /className=\{`assistantSendButton/);
  assert.match(app, /<ArrowUp size=\{20\}/);
  assert.match(app, /aria-label=\{busy \? "Stop response" : "Send"\}/);
  assert.match(app, /mode:\s*"chat" \| "phone"/);
  assert.match(app, /setMode\("chat"\)/);
  assert.match(app, /setMode\("phone"\)/);
  assert.match(app, /Telnyx LiteLLM/);
  assert.match(app, /panelPhoneDialer/);
  assert.match(app, /dialpadKeys/);
  assert.match(app, /appendDialDigit/);
  assert.match(app, /deleteDialDigit/);
  assert.match(app, /panelPhoneKeypad/);
  assert.match(app, /panelPhoneCallButton/);
  assert.match(app, /panelPhoneActiveControls/);
  assert.match(app, /sidebarCallActive &&/);
  assert.match(app, /linkedPhoneNumber/);
  assert.match(app, /Search bookmarked agents/);
  assert.match(app, /bookmarkedAgentIds/);
  assert.match(app, /telnyx-link-bookmarked-agents/);
  assert.match(app, /agent\.id !== "slack-bot-troubleshooting"/);
  assert.match(app, /Bookmark agents on the Agents page to use them in chat/);
  assert.doesNotMatch(app, /<em>\{agent\.source\}<\/em>/);
  assert.match(app, /selectedChatAgentId/);
  assert.match(app, /telnyx-link-selected-chat-agent/);
  assert.match(app, /assistantAgentTrigger/);
  assert.match(app, /assistantSettingsOpen/);
  assert.match(app, /assistantAttachMenuOpen/);
  assert.match(app, /assistantAttachMenuRef/);
  assert.match(app, /agentPickerRef/);
  assert.match(app, /assistantSettingsTriggerRef/);
  assert.match(app, /assistantSettingsPopoverRef/);
  assert.match(app, /handleOutsidePointerDown/);
  assert.match(app, /document\.addEventListener\("mousedown", handleOutsidePointerDown\)/);
  assert.match(app, /document\.addEventListener\("keydown", handleEscape\)/);
  assert.match(app, /Chat settings/);
  assert.match(app, /className="assistantComposerTools"/);
  assert.match(app, /className="assistantAttachMenu"/);
  assert.match(app, /Add photos & files/);
  assert.doesNotMatch(app, /Attach Electron/);
  assert.match(app, /Plan mode/);
  assert.match(app, /Pursue goal/);
  assert.match(app, /Feature request/);
  assert.match(app, /Create skill/);
  assert.match(app, /featureRequestMode/);
  assert.match(app, /createSkillMode/);
  assert.match(app, /team-telnyx\/link/);
  assert.match(app, /SKILL\.md/);
  assert.doesNotMatch(app, /openPluginsFromComposer/);
  assert.doesNotMatch(app, /<span>Plugins<\/span>/);
  assert.match(app, /assistantSessionAgent/);
  assert.match(app, /attachPhotosAndFiles/);
  assert.doesNotMatch(app, /attachElectronContext/);
  assert.match(app, /className="iconButton assistantSettingsTrigger"/);
  assert.doesNotMatch(app, />\\s*New Chat\\s*</);
  assert.doesNotMatch(app, /assistantActionsOpen/);
  assert.match(app, /<small>Session<\/small>/);
  assert.match(app, /aria-label="Session name"/);
  assert.match(app, /linkApi\.renameChatSession/);
  assert.match(styles, /\.assistantSessionTitleInput\s*{/);
  assert.doesNotMatch(app, /<small>Project session<\/small>/);
  assert.match(app, /Approval mode/);
  assert.match(app, /Runtime route/);
  assert.match(app, /Automatic from selected agent/);
  assert.match(app, /Automatic/);
  assert.doesNotMatch(app, /Context scope/);
  assert.match(app, /approvalMode:\s*acceptMode/);
  assert.match(app, /modelMode/);
  assert.doesNotMatch(app, /contextScope/);
  assert.match(app, /setAgentPickerOpen\(false\);[\s\S]*?setAssistantSettingsOpen/);
  assert.match(app, /agentId:\s*selectedChatAgent\?\.id/);
  assert.match(app, /agentName:\s*selectedChatAgent\?\.displayName/);
  assert.match(app, /function suggestDocsUpdate/);
  assert.doesNotMatch(app, /Suggest docs update/);
  assert.match(app, /function openLiteLlmSettings/);
  assert.match(app, /Add LiteLLM API key/);
  assert.match(app, /runtimeSettingsButton/);
  assert.match(app, /githubRepo:\s*"team-telnyx\/link"/);
  assert.match(app, /https:\/\/support\.telnyx\.com\/en\//);
  assert.match(app, /https:\/\/developers\.telnyx\.com\/docs\/overview/);
  assert.match(styles, /\.docsSuggestionButton,\s*\n\.runtimeSettingsButton\s*{/);
  assert.match(styles, /\.runtimeSettingsButton\s*{/);
  assert.match(main, /aidaAgentRouteInstruction/);
  assert.match(main, /createAidaAgentHandoff/);
  assert.match(main, /confirm your Telnyx LiteLLM API key is saved/);
  assert.match(main, /OpenClaw or Hermes as the agent runtime/);
  assert.match(main, /https:\/\/api-internal\.telnyx\.com\/aida\/mcp\//);
  assert.doesNotMatch(main, /claude mcp add/);
  assert.doesNotMatch(main, /mcp-remote/);
  assert.match(app, /Choose number/);
  assert.doesNotMatch(styles, /\.assistantOverflowButton\s*{/);
  assert.doesNotMatch(styles, /\.assistantActionMenu\s*{/);
  assert.match(styles, /\.assistantComposerTools\s*{/);
  assert.match(styles, /\.assistantAttachMenu\s*{/);
  assert.match(styles, /\.assistantAttachToggle input:checked::before\s*{/);
  assert.match(styles, /\.assistantComposerSubmit\s*{/);
  assert.match(styles, /\.messageArtifactLink\s*{/);
  assert.match(styles, /\.artifactViewer\s*{/);
  assert.match(styles, /\.assistantSendButton\s*{/);
  assert.match(styles, /\.voiceInputButton\.active\s*{/);
  assert.match(styles, /\.voiceInputStatus\s*{/);
  assert.match(styles, /\.assistantSettingsPopover\s*{/);
  assert.match(styles, /\.assistantSettingsPopover\s*\{[\s\S]*?z-index:\s*80/);
  assert.doesNotMatch(app, /className="assistantSettingsSummary"/);
  assert.match(styles, /\.assistantNotice\.warning\s*{/);
  assert.match(styles, /\.assistantAgentPicker\s*{/);
  assert.match(styles, /\.agentPickerMenu\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 8px\)/);
  assert.match(styles, /\.agentPickerList button\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.agentPickerList\s*{/);
  assert.match(styles, /\.agentPickerEmpty\s*{/);
  assert.match(styles, /\.bookmarkButton\.selected\s*{/);
  assert.match(styles, /\.assistantPanel\s*{[^}]*background:\s*#fbfaf9/s);
  assert.match(styles, /\.desktop\[data-theme="dark"\] \.assistantTabs button\s*{/);
  assert.match(styles, /\.desktop\[data-theme="dark"\] \.assistantMessage strong\s*{/);
  assert.match(styles, /\.desktop\[data-theme="dark"\] \.assistantComposer textarea::placeholder\s*{/);
  assert.match(styles, /\.assistantComposer textarea/);
  assert.match(styles, /\.panelPhoneDialer\s*{/);
  assert.match(styles, /\.panelPhoneKeypad\s*{/);
  assert.match(styles, /\.panelPhoneKey\s*{/);
  assert.match(styles, /\.panelPhoneCallButton\s*{/);
  assert.match(styles, /\.panelPhoneActiveControls\s*{/);
});

test("chats page uses expandable project-grouped session rows", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(app, /workspaces=\{workspaces\}/);
  assert.match(app, /memoryBanks=\{memoryBanks\}/);
  assert.match(app, /openMemory=\{\(\) => setMemoryOpen\(true\)\}/);
  assert.match(app, /sessionsByWorkspace/);
  assert.match(app, /aria-label="Chat sessions"/);
  assert.match(app, /<h1>Chat<\/h1>/);
  assert.match(app, /const \[filtersOpen, setFiltersOpen\] = useState\(false\)/);
  assert.match(app, /chatSearchRow/);
  assert.match(app, /Search chats, docs, actions, sources, outputs, or archive/);
  assert.match(app, /aria-label=\{filtersOpen \? "Hide chat filters" : "Show chat filters"\}/);
  assert.match(app, /chatFilterBar/);
  assert.match(app, /All models/);
  assert.match(app, /className="chatDirectorySectionTitle"/);
  assert.doesNotMatch(app, /<div className="chatDirectorySectionTitle">Chat<\/div>/);
  assert.match(app, /function renderSessionRow/);
  assert.match(app, /className=\{`chatResultRow/);
  assert.match(app, /className="chatResultDetails"/);
  assert.match(app, /\["chat", "Chat", MessageSquare\]/);
  assert.match(app, /\["docs", "Docs", BookOpen\]/);
  assert.match(app, /\["actions", "Actions", SquareCheck\]/);
  assert.match(app, /\["archive", "Archive", ArchiveIcon\]/);
  assert.match(app, /initialTab="memories"/);
  assert.match(app, /initialQuery=\{archiveQueryForSession\(session\)\}/);
  assert.match(styles, /\.chatSessionRows\s*{/);
  assert.match(styles, /\.chatView\s*\{[\s\S]*?grid-template-rows:\s*auto auto auto minmax\(0,\s*1fr\)[\s\S]*?align-content:\s*start/);
  assert.match(styles, /\.chatSearchRow\s*\{[\s\S]*?grid-template-columns:\s*44px minmax\(280px,\s*1fr\)/);
  assert.match(styles, /\.chatFilterBar\s*\{/);
  assert.match(styles, /\.chatResultRow\s*{/);
  assert.match(styles, /\.chatResultDetails\s*{/);
  assert.match(styles, /\.archiveTabsSurface\.compact/);
});

test("chat sessions are selectable without the global top tab bar", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(app, /function openChatSession/);
  assert.match(app, /selectSession=\{openChatSession\}/);
  assert.doesNotMatch(app, /openChatTabIds/);
  assert.doesNotMatch(app, /function closeChatTab/);
  assert.doesNotMatch(app, /className="tabClose"/);
  assert.match(api, /let previewChatSessions: ChatSession\[\] = \[\]/);
  assert.match(api, /if \(!session\) \{/);
  assert.doesNotMatch(styles, /\.tabStrip\s*{/);
  assert.doesNotMatch(styles, /\.tabClose\s*{/);
  assert.match(styles, /\.mainPane\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\)/);
});

test("main process has v2 state, live-ready adapters, and approval-gated PR flow", async () => {
  const main = await readFile("src/main/main.js", "utf8");

  assert.match(main, /const stateVersion = 5/);
  assert.match(main, /saved\.version === stateVersion \|\| saved\.version === 4/);
  assert.match(main, /TABLEAU_WIDGETS_SERVICE_URL/);
  assert.match(main, /link:list-widget-catalog/);
  assert.match(main, /widgetLayout/);
  assert.match(main, /tableauWidgetHeaders/);
  assert.match(main, /ACP identity and Tableau view entitlement/);
  assert.match(main, /LITELLM_BASE_URL/);
  assert.match(main, /HINDSIGHT_API_KEY/);
  assert.match(main, /GURU_COLLECTION_ID/);
  assert.match(main, /GOOGLE_DRIVE_ACCESS_TOKEN/);
  assert.match(main, /TELNYX_ACTOR/);
  assert.match(main, /\/phone_numbers/);
  assert.doesNotMatch(main, /available_phone_numbers/);
  assert.match(main, /listAccountPhoneNumbers/);
  assert.match(main, /a2a-discovery\.query\.prod\.telnyx\.io:4000/);
  assert.match(main, /\/api\/agents\?page=1&page_size=50/);
  assert.match(main, /telnyxDocsSources/);
  assert.match(main, /searchTelnyxDocs/);
  assert.match(main, /searchIntercomHelpCenter/);
  assert.match(main, /searchMintlifyDocs/);
  assert.match(main, /INTERCOM_ACCESS_TOKEN/);
  assert.match(main, /MINTLIFY_API_KEY/);
  assert.match(main, /team-telnyx\/link/);
  assert.match(main, /Selected Link chat agent/);
  assert.match(main, /hindsightAgentCapabilityInstruction/);
  assert.match(main, /Hindsight is Link's source-attributed long-term memory layer/);
  assert.match(main, /listA2aDiscoveryAgents/);
  assert.match(main, /users\.list/);
  assert.match(main, /chat\.postMessage/);
  assert.match(main, /conversations\.open/);
  assert.match(main, /detectWorkboardProviders/);
  assert.match(main, /Hermes Kanban/);
  assert.match(main, /OpenClaw Workboard/);
  assert.match(main, /Link local board/);
  assert.match(main, /safeStorage/);
  assert.match(main, /link-desktop-credentials\.v1\.json/);
  assert.match(main, /LINK_PR_MODE !== "live"/);
  assert.doesNotMatch(main, /Draft PR creation is mocked/);
  assert.match(main, /Live GitHub PR creation requires/);
});

test("workboard page has provider-aware adapters and local fallback UI", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(app, /WorkboardView/);
  assert.match(app, /<h1>Tasks<\/h1>/);
  assert.doesNotMatch(app, /Dispatch ready/);
  assert.doesNotMatch(app, /workboardProviderGrid/);
  assert.doesNotMatch(app, /workboardSummary/);
  assert.doesNotMatch(styles, /\.workboardProviderGrid/);
  assert.doesNotMatch(styles, /\.workboardSummary/);
  assert.doesNotMatch(styles, /\.metricValue/);
  assert.match(app, /className="kanbanScroller"/);
  assert.match(app, /workboardSearchRow/);
  assert.match(app, /const \[filtersOpen, setFiltersOpen\] = useState\(false\)/);
  assert.match(app, /Hide task filters/);
  assert.match(app, /savedBotAssignees/);
  assert.match(app, /Choose saved bot/);
  assert.match(app, /Add Task/);
  assert.doesNotMatch(app, /Add card/);
  assert.match(styles, /\.workboardView\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(styles, /\.workboardSearchRow\s*\{[\s\S]*?grid-template-columns:\s*44px minmax\(280px,\s*1fr\)/);
  assert.match(styles, /\.workboardToolbar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(180px,\s*220px\) auto/);
  assert.match(styles, /\.kanbanScroller\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(styles, /\.kanbanBoard\s*\{[\s\S]*?width:\s*max-content/);
  assert.match(app, /Search cards, labels, assignees, or diagnostics/);
  assert.match(styles, /\.kanbanColumn\s*{[^}]*min-width:\s*0/s);
  assert.match(styles, /\.workboardRows\s*\{[\s\S]*?gap:\s*10px/);
  assert.match(styles, /\.workboardRowEmpty\s*\{[\s\S]*?min-height:\s*42px/);
  assert.match(api, /WorkboardProvider = "auto" \| "hermes" \| "openclaw" \| "local"/);
  assert.match(api, /WorkboardSnapshot/);
});

test("phone page links existing Telnyx numbers and keeps calling controls in the sidebar", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const main = await readFile("src/main/main.js", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
    dependencies: Record<string, string>;
  };

  assert.ok(pkg.dependencies["@telnyx/webrtc"]);
  assert.match(app, /PhoneView/);
  assert.match(app, /Your Telnyx numbers/);
  assert.match(app, /Refresh numbers/);
  assert.match(app, /listAccountPhoneNumbers/);
  assert.match(app, /telnyxApiReady/);
  assert.doesNotMatch(app, /Generate setup plan/);
  assert.doesNotMatch(app, /Purchase & provision/);
  assert.doesNotMatch(app, /Purchase review/);
  assert.doesNotMatch(app, /SIP \/ WebRTC/);
  assert.doesNotMatch(app, /Telnyx API key<\/span>/);
  assert.match(app, /Add your Telnyx API key in Settings/);
  assert.match(app, /Voice AI assistant/);
  assert.match(app, /AI Assistants/);
  assert.match(app, /Refresh assistants/);
  assert.match(app, /Link assistant to number/);
  assert.match(app, /Open Telnyx Portal/);
  assert.match(app, /selectedPhoneAssistantId/);
  assert.match(app, /listPhoneAssistants/);
  assert.doesNotMatch(app, /Create assistant/);
  assert.doesNotMatch(app, /Assistant instructions/);
  assert.match(app, /Multi-participant AI calls/);
  assert.match(app, /multiParticipantEnabled/);
  assert.match(app, /Phone or SIP URI/);
  assert.match(app, /Skip Turn/);
  assert.match(app, /Weekly availability windows/);
  assert.match(app, /defaultAvailabilityWindows/);
  assert.match(app, /\$\{window\.label\} start time/);
  assert.match(app, /availabilitySlider/);
  assert.match(app, /Google Calendar availability/);
  assert.doesNotMatch(app, /Calendar ID/);
  assert.doesNotMatch(app, /Calendar action/);
  assert.doesNotMatch(app, /Calendar webhook/);
  assert.doesNotMatch(app, /Google Calendar OAuth still belongs/);
  assert.match(app, /Contact search/);
  assert.match(app, /Search connected contacts/);
  assert.match(app, /Contact source filters/);
  assert.match(app, /label: "Google"/);
  assert.match(app, /label: "Salesforce"/);
  assert.match(app, /setDialNumber\(contact\.phone\)/);
  assert.match(app, /No connected contacts yet/);
  assert.doesNotMatch(app, /contact-pete/);
  assert.doesNotMatch(app, /AI SWE Agent/);
  assert.doesNotMatch(app, /Acme Primary Contact/);
  assert.doesNotMatch(app, /Seb Goodijn/);
  assert.doesNotMatch(app, /Acme QBR attendee/);
  assert.match(app, /panelPhoneDialer/);
  assert.match(app, /Choose number/);
  assert.match(app, /connectors=\{connectors\}/);
  assert.ok(main.includes("/ai/assistants"));
  assert.ok(main.includes("/phone_numbers"));
  assert.doesNotMatch(main, /available_phone_numbers/);
  assert.doesNotMatch(main, /phone_number_orders/);
  assert.doesNotMatch(main, /POST", "\/ai\/assistants"/);
  assert.doesNotMatch(app, /panelPhoneFeature/);
  assert.doesNotMatch(styles, /\.panelPhoneFeature/);
  assert.doesNotMatch(app, /Link can handle the phone number, dialer, and Voice AI setup for you\./);
});

test("calendar page uses Google Calendar meetings for calls and transcripts", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const main = await readFile("src/main/main.js", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(api, /\|\s*"calendar"/);
  assert.match(app, /CalendarDays/);
  assert.match(app, /\{ id: "phone", label: "Phone", icon: Phone \},\n\s*\{ id: "calendar", label: "Calendar", icon: CalendarDays \}/);
  assert.match(app, /view === "calendar"/);
  assert.match(app, /function CalendarView/);
  assert.match(app, /connectors=\{connectors\} linkedPhoneNumber=\{linkedPhoneNumber\} setView=\{setView\}/);
  assert.match(app, /Google Calendar/);
  assert.match(app, /calendarEvents:\s*CalendarEventItem\[\]\s*=\s*\[\]/);
  assert.match(app, /Connect Google Calendar to show meetings/);
  assert.match(app, /calendarLayout/);
  assert.match(app, /Calendar/);
  assert.match(app, /List/);
  assert.match(app, /Start meeting/);
  assert.match(app, /Start call/);
  assert.match(app, /Notes and transcripts/);
  assert.doesNotMatch(app, /Previous notes and transcripts/);
  assert.doesNotMatch(app, /Acme Messaging escalation/);
  assert.doesNotMatch(app, /Gemini transcript/);
  assert.match(app, /setView\("phone"\)/);
  assert.doesNotMatch(api, /connector\("google-calendar", "Google Calendar", "Calendar"/);
  assert.match(main, /id:\s*"google-calendar"[\s\S]*?name:\s*"Google Calendar"[\s\S]*?category:\s*"Calendar"/);
  assert.match(styles, /\.calendarControls\s*{/);
  assert.match(styles, /\.calendarEventGrid\s*{/);
  assert.match(styles, /\.calendarEmptyState\s*{/);
});

test("agents page includes search and squad filtering for discovered agents", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");
  const main = await readFile("src/main/main.js", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const styles = await readFile("src/renderer/styles.css", "utf8");

  assert.match(app, /squadFilter/);
  assert.match(app, /pluginFilter/);
  assert.match(app, /sortMode/);
  assert.match(app, /useState<"az" \| "za" \| "status">\("az"\)/);
  assert.match(app, /setTab\] = useState<"agents" \| "my-agents" \| "mcps">\("agents"\)/);
  assert.match(app, /aria-label="Agent sections"/);
  assert.match(app, /className="agentTabs"/);
  assert.match(app, /\["agents", "Agents", Bot\]/);
  assert.match(app, /\["my-agents", "My Agents", Users\]/);
  assert.match(app, /\["mcps", "MCPs", Grid2X2\]/);
  assert.match(app, /tab === "my-agents"/);
  assert.match(app, /tab === "mcps"/);
  assert.match(app, /linkApi\.listHostedAgents/);
  assert.match(app, /filteredHostedAgents/);
  assert.match(app, /sortHostedAgents\(results, sortMode\)/);
  assert.match(app, /Search my agents/);
  assert.match(app, /All statuses/);
  assert.match(app, /Add Agent/);
  assert.match(app, /openAddAgentFlow/);
  assert.match(app, /linkApi\.openAgentControlPlaneSetup/);
  assert.match(app, /telnyx-link-active-agent/);
  assert.doesNotMatch(app, /<Panel title="Active agent">/);
  assert.doesNotMatch(app, /Swap agents by selecting another agent below/);
  assert.match(app, /Use agent/);
  assert.match(app, /setActiveAgent\(\{ id: agent\.id, displayName: agent\.displayName \}\)/);
  assert.match(app, /<ConnectionsView[\s\S]*?connectors=\{filteredConnectors\}[\s\S]*?tools=\{filteredTools\}[\s\S]*?embedded/);
  assert.match(app, /agentFilterButton/);
  assert.match(app, /SlidersHorizontal/);
  assert.match(app, /Search agents, skills, tools, or squads/);
  assert.match(app, /All squads/);
  assert.match(app, /All categories/);
  assert.match(app, /Search MCPs, APIs, and plugins/);
  assert.match(app, /className="mcpsPanel"/);
  assert.doesNotMatch(app, /<CredentialSection title="MCP Access"/);
  assert.doesNotMatch(app, /optionalCredentials/);
  assert.match(app, /openSettings=\{\(\) => setTab\("mcps"\)\}/);
  assert.match(app, /sortAgents\(results, sortMode\)/);
  assert.match(app, /sortConnectors\(results, sortMode\)/);
  assert.match(app, /sortTools\(results, sortMode\)/);
  assert.match(app, /sendAgentMessage/);
  assert.match(app, /Message \$\{agent\.displayName\}/);
  assert.match(app, /function toggleBookmark/);
  assert.match(app, /Bookmark agent/);
  assert.match(app, /Remove bookmark/);
  assert.match(app, /bookmarkedAgentIdSet\.has\(agent\.id\)/);
  assert.match(app, /function agentTypeLabel/);
  assert.match(app, /function connectorTypeLabel/);
  assert.match(app, /connectorTypeLabel\(connector\)/);
  assert.match(app, /pluginConsole/);
  assert.match(app, /pluginRowConsole/);
  assert.match(app, /connectorRowSummary/);
  assert.match(app, /connectorRowDetails/);
  assert.match(app, /<h1>MCPs<\/h1>/);
  assert.match(styles, /\.pluginConsole\s*\{[\s\S]*?background:\s*var\(--surface\)/);
  assert.match(styles, /\.pluginRowConsole\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(styles, /\.connectorRowSummary\s*\{[\s\S]*?grid-template-columns:\s*20px 34px minmax\(0,\s*1fr\) auto/);
  assert.match(app, /connectorInitials/);
  assert.match(app, /expandedConnectorIds/);
  assert.match(app, /agentTypeLabel\(agent\)/);
  assert.match(app, /formatVisibilityLabel\(agent\.visibility\)/);
  assert.match(app, /if \(visibility\.toLowerCase\(\) === "internal"\) return "Internal"/);
  assert.match(app, /agentSquadLabel\(agent\)/);
  assert.match(app, /expandedAgentIds\.includes\(agent\.id\)/);
  assert.match(app, /agent\.squad && <span>\{agent\.squad\}<\/span>/);
  assert.match(styles, /\.agentSquadBadge\s*\{/);
  assert.match(styles, /\.agentDetailsPanel\s*\{/);
  assert.doesNotMatch(app, /\[agent\.squad, agent\.type, agent\.status, agent\.origin\]\.filter\(Boolean\)\.join\(" - "\)/);
  assert.match(app, /return "MCP"/);
  assert.match(app, /return "API"/);
  assert.doesNotMatch(api, /connector\("mcp-proxy", "Telnyx MCP Proxy", "MCP"/);
  assert.match(main, /id:\s*"mcp-proxy"[\s\S]*?name:\s*"Telnyx MCP Proxy"[\s\S]*?category:\s*"MCP"/);
  assert.match(main, /mcpProxyFallbackServers/);
  assert.match(main, /fetchMcpProxyServers/);
  assert.match(main, /\/mcp-registry\/servers/);
  assert.match(main, /\/mcp-registry\/tools/);
  assert.match(main, /MCP_PROXY_URL/);
  assert.doesNotMatch(app, /A2A discovery/);
  assert.doesNotMatch(app, /Agents are loaded from the internal A2A discovery directory/);
  assert.doesNotMatch(app, /Agent rescue/);
  assert.doesNotMatch(app, /Draft rescue request/);
  assert.doesNotMatch(app, /function draftRescue/);
  assert.doesNotMatch(app, /messageTroubleshootingBot/);
  assert.doesNotMatch(main, /agentRescueSlackAgent/);
  assert.match(main, /isHiddenA2aAgent/);
  assert.match(main, /automated hermes health check agent/);
  assert.match(main, /function aidaAgent/);
  assert.match(main, /source:\s*"aida"/);
  assert.match(api, /source: "agent-control-plane" \| "a2a-discovery" \| "slack" \| "aida"/);
  assert.match(main, /displayName: "AIDA"/);
  assert.match(styles, /\.agentTabs\s*\{[\s\S]*?width:\s*min\(1120px,\s*100%\)[\s\S]*?margin:\s*0 auto 8px/);
  assert.match(styles, /\.agentControls\s*\{[\s\S]*?grid-template-columns:\s*44px minmax\(280px,\s*1fr\) 112px[\s\S]*?align-items:\s*center/);
  assert.match(app, /agentFilter agentSortFilter/);
  assert.match(styles, /\.agentGrid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(styles, /\.agentCard p\s*\{[\s\S]*?-webkit-line-clamp:\s*3/);
  assert.match(styles, /\.agentCard\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(styles, /\.agentFilterPanel\s*{/);
  assert.match(styles, /\.mcpsPanel\s*{/);
  assert.doesNotMatch(app, /activeAgentPanel/);
  assert.match(styles, /\.myAgentRow\.selected\s*{/);
  assert.match(styles, /\.desktop select\s*\{[\s\S]*?background-position:\s*right 14px center/);
});

test("local credentials stay out of source and Okta password storage is not supported", async () => {
  const main = await readFile("src/main/main.js", "utf8");

  assert.doesNotMatch(main, /OKTA_PASSWORD/);
  assert.doesNotMatch(main, /okta password/i);
  assert.match(main, /encryptString/);
  assert.match(main, /decryptString/);
});
