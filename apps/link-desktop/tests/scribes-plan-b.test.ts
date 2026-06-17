import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Scribes Plan B exposes model manager IPC and allowlisted local STT routes", async () => {
  const main = await readFile("src/main/main.js", "utf8");
  const api = await readFile("src/renderer/api.ts", "utf8");
  const preload = await readFile("src/main/preload.cjs", "utf8");
  const app = await readFile("src/renderer/App.tsx", "utf8");

  for (const channel of [
    "link:scribes-status",
    "link:scribes-list-models",
    "link:scribes-provider-route",
    "link:scribes-download-model",
    "link:scribes-delete-model",
    "link:scribes-cancel-download",
    "link:scribes-transcribe-local",
    "link:scribes-start-local-server",
    "link:scribes-stop-local-server",
  ]) {
    assert.match(main, new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const method of [
    "getScribesStatus",
    "listScribesModels",
    "getScribesProviderRoute",
    "downloadScribesModel",
    "deleteScribesModel",
    "cancelScribesModelDownload",
    "transcribeScribesLocal",
    "startScribesLocalServer",
    "stopScribesLocalServer",
  ]) {
    assert.match(preload, new RegExp(`${method}:`));
    assert.match(api, new RegExp(`${method}\\(`));
  }

  assert.match(main, /const scribesModelRegistry = \[/);
  assert.match(main, /id:\s*"whisper\.cpp\/tiny\.en"/);
  assert.match(main, /id:\s*"whisper\.cpp\/base"/);
  assert.match(main, /id:\s*"parakeet-tdt-0\.6b-v3"/);
  assert.match(main, /https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/main\/ggml-base\.en\.bin/);
  assert.match(main, /https:\/\/github\.com\/k2-fsa\/sherpa-onnx\/releases\/download\/asr-models\/sherpa-onnx-nemo-parakeet-tdt-0\.6b-v3-int8\.tar\.bz2/);
  assert.match(main, /Unknown Scribes model id\. Choose one of the allowlisted Scribes models\./);
  assert.match(main, /path\.relative\(root, target\)/);
  assert.match(main, /Refusing to access a Scribes path outside the model store/);
  assert.match(main, /fs\.statfs\(scribesModelsRoot\(\)\)/);
  assert.match(main, /AbortController/);
  assert.match(main, /controller\.abort\(\)/);
  assert.match(main, /tar", \["-tjf", archivePath\]/);
  assert.match(main, /X-Scribes-Token/i);
  assert.match(main, /server\.listen\(0, "127\.0\.0\.1"/);

  assert.match(api, /interface ScribesStatus/);
  assert.match(api, /interface ScribesSettings/);
  assert.match(api, /interface ScribesModel/);
  assert.match(api, /interface ScribesSession/);
  assert.match(api, /interface ScribesProviderRoute/);
  assert.match(app, /function ScribesLocalVoiceModelsPanel/);
  assert.match(app, /aria-label="Scribe local voice models"/);
  assert.match(app, /Local Voice Models/);
  assert.match(app, /<ScribesLocalVoiceModelsPanel \/>/);
});

test("native helper keeps HUD and paste controller while routing local STT through Scribes", async () => {
  const session = await readFile("native/telnyx-whisper/Sources/TelnyxDictationLib/DictationSession.swift", "utf8");
  const coordinator = await readFile("native/telnyx-whisper/Sources/TelnyxDictationLib/DictationCoordinator.swift", "utf8");
  const localClient = await readFile("native/telnyx-whisper/Sources/TelnyxDictationLib/ScribesLocalSTTStreamingClient.swift", "utf8");
  const appDelegate = await readFile("native/telnyx-whisper/Sources/TelnyxDictationLib/AppDelegate.swift", "utf8");
  const menuBarHud = await readFile("native/telnyx-whisper/Sources/TelnyxDictationLib/MenuBarHUDPresenter.swift", "utf8");
  const hotKeys = await readFile("native/telnyx-whisper/Sources/TelnyxDictationLib/GlobalHotKeyController.swift", "utf8");

  assert.match(session, /func finishAudio\(\) async throws/);
  assert.match(session, /public extension STTStreaming/);
  assert.match(coordinator, /try await sttStreaming\.finishAudio\(\)/);
  assert.match(appDelegate, /sttStreaming:\s*ScribesSTTStreamingFactory\.makeStreamingClient\(language: selectedLanguage\(\)\)/);
  assert.match(appDelegate, /textInserter:\s*PasteboardTextInserter\(\)/);
  assert.match(appDelegate, /TELNYX_WHISPER_SHORTCUT_MODE/);
  assert.match(appDelegate, /selectedShortcutModeDefaultsKey/);
  assert.match(appDelegate, /selectedLanguageDefaultsKey/);
  assert.match(appDelegate, /showFlowBarAlwaysDefaultsKey/);
  assert.match(appDelegate, /Show Scribe Bar at All Times/);
  assert.match(appDelegate, /Paste Last Transcript/);
  assert.match(appDelegate, /NSMenu\(title: "Languages"\)/);
  assert.match(appDelegate, /shortcutMode:\s*shortcutMode/);
  assert.match(appDelegate, /title:\s*"\\\(dictationShortcutLabel\(\)\) to Dictate"/);
  assert.match(menuBarHud, /setFlowBarVisibleAtAllTimes/);
  assert.match(menuBarHud, /flowBarWindow/);
  assert.match(menuBarHud, /positionFlowBar/);
  assert.match(hotKeys, /enum ShortcutMode/);
  assert.match(hotKeys, /case holdFunction/);
  assert.match(hotKeys, /case commandShiftL/);
  assert.match(hotKeys, /if shortcutMode == \.commandShiftL/);
  assert.match(hotKeys, /guard shortcutMode == \.holdFunction else/);
  assert.match(localClient, /public final class ScribesLocalSTTStreamingClient/);
  assert.match(localClient, /TELNYX_WHISPER_SCRIBES_ENDPOINT/);
  assert.match(localClient, /TELNYX_WHISPER_SCRIBES_TOKEN/);
  assert.match(localClient, /TELNYX_WHISPER_STT_MODE"\] == "local"/);
  assert.match(localClient, /language: language \?\? environment\["TELNYX_WHISPER_LANGUAGE"\] \?\? "en-US"/);
  assert.match(localClient, /languageProvider:\s*\{ language \?\? environment\["TELNYX_WHISPER_LANGUAGE"\] \?\? "en-US" \}/);
  assert.match(localClient, /continuation\.yield\(\.final\(transcript\)\)/);
});
