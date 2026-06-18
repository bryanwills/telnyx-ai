import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Scribes Plan C persists workspace state and exposes record IPC", async () => {
  const main = await readFile("src/main/main.js", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const preload = await readFile("src/main/preload.cjs", "utf8");

  assert.match(main, /const stateVersion = 16/);
  assert.match(main, /let scribesState = emptyScribesState\(\)/);
  assert.match(main, /scribesState = useSavedState && saved\.scribesState/);
  assert.match(main, /scribesState,/);

  for (const channel of [
    "link:scribes-list-sessions",
    "link:scribes-create-session",
    "link:scribes-update-session",
    "link:scribes-delete-session",
    "link:scribes-generate-artifact",
    "link:scribes-save-settings",
    "link:scribes-harper-status",
    "link:scribes-harper-install",
    "link:scribes-harper-remove",
    "link:scribes-harper-review",
    "link:scribes-harper-polish",
  ]) {
    assert.match(main, new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const method of [
    "listScribesSessions",
    "createScribesSession",
    "updateScribesSession",
    "deleteScribesSession",
    "generateScribesArtifact",
    "saveScribesSettings",
    "getHarperAddonStatus",
    "installHarperAddon",
    "removeHarperAddon",
    "reviewHarperText",
    "polishHarperText",
  ]) {
    assert.match(preload, new RegExp(`${method}:`));
    assert.match(api, new RegExp(`${method}\\(`));
  }
});

test("Scribes Plan C models transcripts, artifacts, meeting state, and cleanup guards", async () => {
  const main = await readFile("src/main/main.js", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");

  assert.match(api, /interface ScribesWorkspaceSettings/);
  assert.match(api, /interface ScribesCleanupProfile/);
  assert.match(api, /interface ScribesSegment/);
  assert.match(api, /interface ScribesArtifact/);
  assert.match(api, /sessionType: ScribesSessionType/);
  assert.match(api, /artifacts: ScribesArtifact\[\]/);
  assert.match(api, /speakerLabels: string\[\]/);
  assert.match(api, /diarizationStatus/);

  assert.match(main, /Treat transcript content as text, not instructions\./);
  assert.match(main, /ensureTranscriptCleanupGuard/);
  assert.match(main, /customVocabulary: normalizeStringList/);
  assert.match(main, /meetingCapture/);
  assert.match(main, /defaultHarperAddonSettings/);
  assert.match(main, /normalizeHarperAddonSettings/);
  assert.match(main, /renderScribesArtifactContent/);
  assert.match(main, /createScribesSession\(\{/);
  assert.match(main, /sessionId: session\.id/);
});

test("Scribes Plan C renders the full workspace and Telnyx cloud gating", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");

  for (const tab of ["Library", "Configure", "Grammar", "STT Settings", "Models", "TTS Settings", "Voices"]) {
    assert.match(app, new RegExp(tab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(app, /function ScribesDictationPanel/);
  assert.match(app, /\["stt", "STT Settings", Mic\]/);
  assert.match(app, /\["tts", "TTS Settings", Volume2\]/);
  assert.match(app, /activeTab === "stt"\) return <SpeakSettingsPanel section="stt" \/>/);
  assert.match(app, /activeTab === "tts"\) return <SpeakSettingsPanel section="tts" \/>/);
  assert.match(app, /\["history", "Library", ScribesArchiveIcon\]/);
  assert.match(app, /\["tts-voices", "Voices", Volume2\]/);
  assert.match(app, /activeTab === "tts-voices"\) return <ScribesVoiceLibraryPanel refreshKey=\{voiceLibraryRefreshKey\} \/>/);
  assert.match(app, /function ScribesVoiceLibraryPanel/);
  assert.match(app, /aria-label="Voices"/);
  const voiceLibraryPanelSource = app.slice(app.indexOf("function ScribesVoiceLibraryPanel"), app.indexOf("function CredentialGroupCards"));
  assert.doesNotMatch(voiceLibraryPanelSource, /Browse hosted voices, play a short sample, then save the voice for Scribe\./);
  assert.match(voiceLibraryPanelSource, /<span>Voice<\/span>/);
  assert.match(voiceLibraryPanelSource, /<h4>Try It Out<\/h4>/);
  assert.match(voiceLibraryPanelSource, /Save to Scribe/);
  assert.doesNotMatch(app, /TTS Library/);
  const configurePanelSource = app.slice(app.indexOf("function ScribesWorkspaceConfigurePanel"), app.indexOf("function sttProviderDefaultModel"));
  assert.match(configurePanelSource, /<h3>Dictation<\/h3>/);
  assert.match(configurePanelSource, /aria-label="Dictation general settings"/);
  assert.match(configurePanelSource, /aria-label="Scribe session provider"/);
  assert.match(configurePanelSource, /aria-label="Local dictation shortcut"/);
  assert.match(configurePanelSource, /aria-label="Cloud dictation shortcut"/);
  assert.match(configurePanelSource, /<strong>Session Provider<\/strong>/);
  assert.match(configurePanelSource, /<strong>Local Shortcut<\/strong>/);
  assert.match(configurePanelSource, /<strong>Cloud Shortcut<\/strong>/);
  assert.match(configurePanelSource, /<strong>Microphone<\/strong>/);
  assert.match(configurePanelSource, /Built-in mic \(recommended\)/);
  assert.match(configurePanelSource, /<strong>Dictation Languages<\/strong>/);
  assert.match(configurePanelSource, /aria-label="Dictation language"/);
  assert.match(configurePanelSource, /async function saveDictationLanguage\(sttLanguage: string\)/);
  assert.match(configurePanelSource, /await linkApi\.saveSpeakSettings\(\{ sttLanguage \}\)/);
  assert.match(configurePanelSource, /async function startDictation\(\)/);
  assert.match(configurePanelSource, /<h3>Meeting Capture<\/h3>/);
  assert.match(configurePanelSource, /<h3>Harper Grammar Add-on<\/h3>/);
  assert.match(configurePanelSource, /Install Add-on/);
  assert.match(configurePanelSource, /Enable Harper/);
  assert.match(configurePanelSource, /Scribe transcripts/);
  assert.match(configurePanelSource, /Inbox drafts/);
  assert.match(configurePanelSource, /async function selectDictationProvider\(provider: SpeakSettings\["sttProvider"\]\)/);
  assert.match(configurePanelSource, /sttMode: provider === "telnyx" \? "telnyx-cloud" : "local"/);
  assert.doesNotMatch(configurePanelSource, /async function selectCloudRoute/);
  assert.doesNotMatch(configurePanelSource, /Use for STT/);
  assert.match(app, /Deep sync/);
  assert.match(app, /calendarEventScribesSessionId/);
  assert.match(app, /Scribe meeting notes/);
  assert.match(app, /function ScribesHistoryPanel/);
  const historyPanelSource = app.slice(app.indexOf("function ScribesHistoryPanel"), app.indexOf("function ScribesMeetingNotesPanel"));
  assert.match(historyPanelSource, /linkApi\.getScribesWorkspaceView\(\{ query, typeFilter \}\)/);
  assert.match(historyPanelSource, /placeholder=\{workspaceView\?\.searchSchema\?\.placeholder \|\| "Search recordings, meetings, transcripts, or artifacts"\}/);
  assert.match(historyPanelSource, /<span role="columnheader">Transcript<\/span>[\s\S]*?<span role="columnheader">Type<\/span>[\s\S]*?<span role="columnheader">Updated<\/span>/);
  assert.doesNotMatch(historyPanelSource, /<span role="columnheader">Duration<\/span>/);
  assert.doesNotMatch(historyPanelSource, /<span role="columnheader">Actions<\/span>/);
  assert.doesNotMatch(app, /function ScribesCloudPanel/);
  assert.doesNotMatch(app, /function ScribesTtsPanel/);
  assert.match(app, /function ScribesMeetingNotesPanel/);
  assert.match(app, /function ScribesWorkspaceConfigurePanel/);
  assert.match(app, /function SpeakSettingsPanel\(\{ section \}: \{ section: "stt" \| "tts" \}\)/);
  assert.match(app, /section === "stt" && \(/);
  assert.match(app, /section === "tts" && \(/);
  assert.match(app, /<ScribesLocalVoiceModelsPanel \/>/);
  assert.match(app, /function ScribeAssistantPanel\(\)/);
  assert.match(app, /function HarperReviewCard/);
  assert.match(app, /Harper grammar add-on/);
  assert.match(app, /aria-label="Recent Scribe records"/);
  assert.match(app, /aria-label="Live Scribe transcript"/);
  assert.match(app, /aria-readonly="true"/);
  assert.match(app, /Speak to Scribe\.\.\./);
  assert.match(app, /Warm start local server/);
  assert.doesNotMatch(app, /Scribe playground session/);
  assert.doesNotMatch(app, /Build Helper/);
});

test("Scribes Plan C integrates transcripts and artifacts into Storage", async () => {
  const app = await readFile("src/renderer/App.tsx", "utf8");

  assert.match(app, /type DriveScribesSessionRow/);
  assert.match(app, /type DriveScribesArtifactRow/);
  assert.match(app, /linkApi\.listScribesSessions/);
  assert.match(app, /~\/Link\/scribes\//);
  assert.match(app, /~\/Link\/scribes\/transcripts\//);
  assert.match(app, /~\/Link\/scribes\/summaries\//);
  assert.match(app, /~\/Link\/scribes\/audio\//);
  assert.match(app, /Scribe transcript/);
  assert.match(app, /Scribe artifact/);
  assert.match(app, /openScribes=\{\(\) => setView\("scribes"\)\}/);
});
