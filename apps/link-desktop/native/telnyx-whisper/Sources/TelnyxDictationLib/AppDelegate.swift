import AppKit

/// Main application delegate. Manages the menubar status item,
/// dictation orchestration, and local utility menus.
public class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {

    private var statusItem: NSStatusItem!
    private let permissionManager = PermissionManager()
    private var hudPresenter: HUDPresenting?
    private var dictationCoordinator: DictationCoordinator?
    private var hotKeyController: GlobalHotKeyController?
    private var statusTitleMenuItem: NSMenuItem?
    private var hotKeySessionTask: Task<Void, Never>?
    private var fixtureSessionTask: Task<Void, Never>?
    private var hudFeedbackTask: Task<Void, Never>?
    private var microphoneProbeLevelTask: Task<Void, Never>?
    private var microphoneProbeTimeoutTask: Task<Void, Never>?
    private var microphoneProbeObservedSamples = false
    private var microphoneProbePeakPercent = 0
    private var hasShownMicrophoneBlockedAlert = false
    private let microphoneDeviceManager = MicrophoneDeviceManager()
    private var audioCaptureEngine: AudioCaptureEngine?
    private var microphoneProbeEngine: AudioCaptureEngine?
    private var selectedMicrophoneUID: String?
    private weak var microphoneMenu: NSMenu?
    private var thresholdSliderView: SilenceThresholdSliderView?
    private var thresholdProbeEngine: AudioCaptureEngine?
    private var thresholdProbeLevelTask: Task<Void, Never>?
    private var llmCleanupMenuItem: NSMenuItem?
    private var startDictationMenuItem: NSMenuItem?
    private weak var shortcutMenu: NSMenu?
    private weak var languageMenu: NSMenu?
    private var showFlowBarMenuItem: NSMenuItem?

    private static let selectedMicUIDDefaultsKey = "selectedMicrophoneUID"
    private static let selectedShortcutModeDefaultsKey = "selectedShortcutMode"
    private static let selectedLanguageDefaultsKey = "selectedLanguage"
    private static let speechThresholdDefaultsKey = "speechThreshold"
    private static let llmCleanupEnabledDefaultsKey = "llmCleanupEnabled"
    private static let showFlowBarAlwaysDefaultsKey = "showFlowBarAlways"

    private static let languageOptions: [(label: String, value: String)] = [
        ("English", "en-US"),
        ("Auto detect", "auto"),
        ("Spanish", "es-ES"),
        ("French", "fr-FR"),
        ("German", "de-DE"),
        ("Italian", "it-IT"),
        ("Portuguese", "pt-BR"),
        ("Dutch", "nl-NL"),
    ]

    private enum MenuBarIconMode {
        case normal
        case listening
        case blocked
    }

    public override init() {
        super.init()
    }

    // MARK: - NSApplicationDelegate

    public func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenuBarItem()
        setupDictationCoordinator()
        setupHotKeys()
        checkPermissions()
        showLaunchConfirmation()
    }

    public func applicationWillTerminate(_ notification: Notification) {
        hotKeySessionTask?.cancel()
        fixtureSessionTask?.cancel()
        hudFeedbackTask?.cancel()
        stopMicrophoneProbe()
        stopThresholdProbe()
        hotKeyController?.stopMonitoring()
    }

    // MARK: - Menu Bar

    @MainActor
    private func setupMenuBarItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            if let img = NSImage(systemSymbolName: "waveform",
                                 accessibilityDescription: "Telnyx Link") {
                img.isTemplate = true
                button.image = img
            } else {
                // Fallback for older systems without SF Symbols
                button.title = "S"
            }
        }

        let menu = NSMenu()
        let statusMenuItem = NSMenuItem(title: "Scribe", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        statusTitleMenuItem = statusMenuItem
        menu.addItem(statusMenuItem)
        menu.addItem(NSMenuItem.separator())

        let startItem = NSMenuItem(
            title: "\(dictationShortcutLabel()) to Dictate",
            action: #selector(startDictationFromMenu),
            keyEquivalent: ""
        )
        startItem.target = self
        startDictationMenuItem = startItem
        menu.addItem(startItem)

        let pasteLastItem = NSMenuItem(
            title: "Paste Last Transcript",
            action: #selector(pasteLastTranscriptFromMenu),
            keyEquivalent: "v"
        )
        pasteLastItem.keyEquivalentModifierMask = [.command, .option]
        pasteLastItem.target = self
        menu.addItem(pasteLastItem)

        menu.addItem(NSMenuItem.separator())

        let shortcutItem = NSMenuItem(title: "Shortcuts", action: nil, keyEquivalent: "")
        let shortcutSubmenu = NSMenu(title: "Shortcuts")
        shortcutItem.submenu = shortcutSubmenu
        menu.addItem(shortcutItem)
        self.shortcutMenu = shortcutSubmenu

        let microphoneItem = NSMenuItem(title: "Input Microphone", action: nil, keyEquivalent: "")
        let microphoneSubmenu = NSMenu(title: "Input Microphone")
        microphoneItem.submenu = microphoneSubmenu
        menu.addItem(microphoneItem)
        self.microphoneMenu = microphoneSubmenu

        let languageItem = NSMenuItem(title: "Languages", action: nil, keyEquivalent: "")
        let languageSubmenu = NSMenu(title: "Languages")
        languageItem.submenu = languageSubmenu
        menu.addItem(languageItem)
        self.languageMenu = languageSubmenu

        let flowBarItem = NSMenuItem(
            title: "Show Scribe Bar at All Times",
            action: #selector(toggleFlowBarFromMenu),
            keyEquivalent: ""
        )
        flowBarItem.target = self
        flowBarItem.state = UserDefaults.standard.bool(forKey: Self.showFlowBarAlwaysDefaultsKey) ? .on : .off
        showFlowBarMenuItem = flowBarItem
        menu.addItem(flowBarItem)

        menu.addItem(NSMenuItem.separator())

        // Silence threshold slider
        let savedThreshold = UserDefaults.standard.float(forKey: Self.speechThresholdDefaultsKey)
        let initialThreshold: Float = savedThreshold > 0 ? savedThreshold : 0.05
        let sliderView = SilenceThresholdSliderView(
            threshold: initialThreshold,
            onThresholdChanged: { [weak self] newValue in
                self?.silenceThresholdChanged(newValue)
            }
        )
        self.thresholdSliderView = sliderView
        let sliderMenuItem = NSMenuItem()
        sliderMenuItem.view = sliderView
        menu.addItem(sliderMenuItem)

        let llmCleanupItem = NSMenuItem(
            title: "LLM Text Cleanup",
            action: #selector(toggleLLMCleanupFromMenu),
            keyEquivalent: ""
        )
        llmCleanupItem.target = self
        let llmDefault = UserDefaults.standard.object(forKey: Self.llmCleanupEnabledDefaultsKey)
        let llmEnabled = llmDefault == nil ? true : UserDefaults.standard.bool(forKey: Self.llmCleanupEnabledDefaultsKey)
        llmCleanupItem.state = llmEnabled ? .on : .off
        self.llmCleanupMenuItem = llmCleanupItem
        menu.addItem(llmCleanupItem)

        let fixtureItem = NSMenuItem(
            title: "Debug: Dictate Fixture and Paste",
            action: #selector(startFixtureDictationFromMenu),
            keyEquivalent: "f"
        )
        fixtureItem.target = self
        menu.addItem(fixtureItem)

        let testMicItem = NSMenuItem(
            title: "Test Selected Microphone",
            action: #selector(testSelectedMicrophoneFromMenu),
            keyEquivalent: ""
        )
        testMicItem.target = self
        menu.addItem(testMicItem)

        let cancelItem = NSMenuItem(
            title: "Cancel Dictation (Esc)",
            action: #selector(cancelDictationFromMenu),
            keyEquivalent: ""
        )
        cancelItem.target = self
        menu.addItem(cancelItem)

        menu.addItem(NSMenuItem.separator())

        let showLastFive = NSMenuItem(
            title: "Show Last 5 Dictations",
            action: #selector(showLastFiveDictationsFromMenu),
            keyEquivalent: ""
        )
        showLastFive.target = self
        menu.addItem(showLastFive)

        let showLastTen = NSMenuItem(
            title: "Show Last 10 Dictations",
            action: #selector(showLastTenDictationsFromMenu),
            keyEquivalent: ""
        )
        showLastTen.target = self
        menu.addItem(showLastTen)

        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Open Scribe Configure",
                                action: #selector(openConfigureFromMenu),
                                keyEquivalent: ""))

        menu.addItem(NSMenuItem.separator())

        menu.addItem(NSMenuItem(title: "Quit Scribe",
                                action: #selector(NSApplication.terminate(_:)),
                                keyEquivalent: "q"))
        menu.delegate = self
        statusItem.menu = menu
        reloadShortcutMenu()
        reloadMicrophoneMenu()
        reloadLanguageMenu()
        updateFlowBarPreference()
    }

    @MainActor
    @objc private func startDictationFromMenu() {
        startLiveDictationSession()
    }

    @MainActor
    @objc private func startFixtureDictationFromMenu() {
        guard let fixtureURL = resolveFixtureURL() else {
            return
        }

        startFixtureDictationSession(fixtureURL: fixtureURL)
    }

    @MainActor
    @objc private func cancelDictationFromMenu() {
        cancelDictationSession()
    }

    @MainActor
    @objc private func showLastFiveDictationsFromMenu() {
        showRecentDictations(limit: 5)
    }

    @MainActor
    @objc private func showLastTenDictationsFromMenu() {
        showRecentDictations(limit: 10)
    }

    @MainActor
    @objc private func pasteLastTranscriptFromMenu() {
        guard let transcript = lastTranscript(), !transcript.isEmpty else {
            showTransientHUDMessage("No recent transcript found yet.")
            return
        }

        do {
            try PasteboardTextInserter().insert(transcript)
            showTransientHUDMessage("Last transcript pasted.")
        } catch {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(transcript, forType: .string)
            showTransientHUDMessage("Last transcript copied. Enable Accessibility for auto-paste.")
        }
    }

    @MainActor
    @objc private func selectShortcutFromMenu(_ sender: NSMenuItem) {
        guard let shortcutMode = sender.representedObject as? String else {
            return
        }

        UserDefaults.standard.set(shortcutMode, forKey: Self.selectedShortcutModeDefaultsKey)
        reloadShortcutMenu()
        setupHotKeys()
        startDictationMenuItem?.title = "\(dictationShortcutLabel()) to Dictate"
        showTransientHUDMessage("Shortcut changed to \(dictationShortcutLabel()).")
    }

    @MainActor
    @objc private func selectMicrophoneFromMenu(_ sender: NSMenuItem) {
        let chosenUID = sender.representedObject as? String
        selectedMicrophoneUID = chosenUID
        UserDefaults.standard.set(chosenUID, forKey: Self.selectedMicUIDDefaultsKey)
        applySelectedMicrophone(runProbe: true)
        reloadMicrophoneMenu()
    }

    @MainActor
    @objc private func selectLanguageFromMenu(_ sender: NSMenuItem) {
        guard let language = sender.representedObject as? String else {
            return
        }

        UserDefaults.standard.set(language, forKey: Self.selectedLanguageDefaultsKey)
        reloadLanguageMenu()
        setupDictationCoordinator()
        showTransientHUDMessage("Dictation language changed to \(languageLabel(language)).")
    }

    @MainActor
    @objc private func toggleFlowBarFromMenu() {
        let nextValue = !UserDefaults.standard.bool(forKey: Self.showFlowBarAlwaysDefaultsKey)
        UserDefaults.standard.set(nextValue, forKey: Self.showFlowBarAlwaysDefaultsKey)
        showFlowBarMenuItem?.state = nextValue ? .on : .off
        updateFlowBarPreference()
    }

    @MainActor
    @objc private func openConfigureFromMenu() {
        showTransientHUDMessage("Open Telnyx Link -> Scribe -> Configure to manage Scribe settings.")
    }

    @MainActor
    @objc private func testSelectedMicrophoneFromMenu() {
        startMicrophoneProbe()
    }

    @MainActor
    @objc private func toggleLLMCleanupFromMenu() {
        guard let item = llmCleanupMenuItem else { return }
        let newState = item.state != .on
        item.state = newState ? .on : .off
        UserDefaults.standard.set(newState, forKey: Self.llmCleanupEnabledDefaultsKey)
        Task {
            await dictationCoordinator?.setLLMCleanupEnabled(newState)
        }
    }

    // MARK: - Silence Threshold

    @MainActor
    private func silenceThresholdChanged(_ newValue: Float) {
        UserDefaults.standard.set(newValue, forKey: Self.speechThresholdDefaultsKey)
        Task {
            await dictationCoordinator?.updateSpeechThreshold(newValue)
        }
    }

    @MainActor
    private func startThresholdProbe() {
        stopThresholdProbe()
        let probe = AudioCaptureEngine()
        if let uid = selectedMicrophoneUID,
           let device = microphoneDeviceManager.inputDevice(uid: uid) {
            probe.setPreferredInputDeviceID(device.id)
        }
        do {
            try probe.start()
        } catch {
            return
        }
        thresholdProbeEngine = probe
        thresholdProbeLevelTask = Task { [weak self] in
            for await level in probe.audioLevels {
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    self?.thresholdSliderView?.updateCurrentLevel(level)
                }
            }
        }
    }

    @MainActor
    private func stopThresholdProbe() {
        thresholdProbeLevelTask?.cancel()
        thresholdProbeLevelTask = nil
        thresholdProbeEngine?.stop()
        thresholdProbeEngine = nil
    }

    // MARK: - Dictation Orchestration

    @MainActor
    private func setupDictationCoordinator() {
        audioCaptureEngine?.stop()
        let menuBarHUDPresenter: MenuBarHUDPresenter
        if let existingPresenter = hudPresenter as? MenuBarHUDPresenter {
            menuBarHUDPresenter = existingPresenter
        } else {
            menuBarHUDPresenter = MenuBarHUDPresenter { [weak self] in
                self?.statusItem.button
            }
            self.hudPresenter = menuBarHUDPresenter
        }
        menuBarHUDPresenter.setFlowBarVisibleAtAllTimes(UserDefaults.standard.bool(forKey: Self.showFlowBarAlwaysDefaultsKey))

        let audioCapture = AudioCaptureEngine()
        audioCaptureEngine = audioCapture
        selectedMicrophoneUID = UserDefaults.standard.string(forKey: Self.selectedMicUIDDefaultsKey)
        applySelectedMicrophone(runProbe: false)
        let savedThreshold = UserDefaults.standard.float(forKey: Self.speechThresholdDefaultsKey)
        let threshold: Float = savedThreshold > 0 ? savedThreshold : 0.05
        let llmDefault = UserDefaults.standard.object(forKey: Self.llmCleanupEnabledDefaultsKey)
        let llmCleanupEnabled = llmDefault == nil ? true : UserDefaults.standard.bool(forKey: Self.llmCleanupEnabledDefaultsKey)
        dictationCoordinator = DictationCoordinator(
            audioCapture: audioCapture,
            audioLevels: { audioCapture.audioLevels },
            sttStreaming: ScribesSTTStreamingFactory.makeStreamingClient(language: selectedLanguage()),
            hudPresenter: menuBarHUDPresenter,
            textInserter: PasteboardTextInserter(),
            accessibilityTrustChecker: { [weak self] in
                self?.permissionManager.isAccessibilityTrusted() ?? false
            },
            silenceDetector: SilenceDetector(speechThreshold: threshold),
            llmCleaner: LLMCleanup(),
            llmCleanupEnabled: llmCleanupEnabled
        )
    }

    private func setupHotKeys() {
        hotKeyController?.stopMonitoring()
        let shortcutMode = GlobalHotKeyController.ShortcutMode(
            environmentValue: selectedShortcutMode()
        )
        let controller = GlobalHotKeyController(
            shortcutMode: shortcutMode,
            onStart: { [weak self] in
                self?.handleStartHotKey()
            },
            onFinish: { [weak self] in
                self?.handleFinishHotKey()
            },
            onCancel: { [weak self] in
                self?.handleCancelHotKey()
            }
        )
        controller.startMonitoring()
        hotKeyController = controller
    }

    private func dictationShortcutLabel() -> String {
        switch selectedShortcutMode() {
        case "cmd-shift-l":
            return "Cmd+Shift+L"
        default:
            return "Hold fn"
        }
    }

    private func handleStartHotKey() {
        Task { @MainActor [weak self] in
            self?.startLiveDictationSession()
        }
    }

    private func handleCancelHotKey() {
        Task { @MainActor [weak self] in
            self?.cancelDictationSession()
        }
    }

    private func handleFinishHotKey() {
        Task { @MainActor [weak self] in
            self?.finishDictationSession()
        }
    }

    @MainActor
    private func startLiveDictationSession() {
        guard let coordinator = dictationCoordinator else {
            return
        }

        stopMicrophoneProbe()

        hotKeySessionTask?.cancel()
        hotKeySessionTask = Task { [weak self] in
            guard let self else {
                return
            }

            let microphoneGranted = await self.permissionManager.requestMicrophoneAccess()
            guard microphoneGranted else {
                self.updateMenuBarStatus("Microphone permission required")
                self.updateMenuBarIcon(mode: .blocked)
                self.showTransientHUDMessage(
                    "Microphone denied. Enable System Settings -> Privacy & Security -> Microphone."
                )
                if !self.hasShownMicrophoneBlockedAlert {
                    self.showPermissionAlert(
                        title: "Microphone Access Required",
                        message: """
                            Telnyx Link cannot start while microphone access is denied.

                            Enable access in System Settings -> Privacy & Security -> Microphone.
                            """,
                        settingsURL: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
                    )
                    self.hasShownMicrophoneBlockedAlert = true
                }
                return
            }

            self.hudFeedbackTask?.cancel()
            self.updateMenuBarIcon(mode: .listening)
            self.updateMenuBarStatus("Listening...")

            let started = await coordinator.startDictation()
            guard started else {
                self.restoreIdleMenuBarStatus()
                return
            }

            self.hotKeyController?.enableCancelHotKey()
            await coordinator.waitForIdle()
            self.hotKeyController?.disableCancelHotKey()
            self.restoreIdleMenuBarStatus()
        }
    }

    @MainActor
    private func startFixtureDictationSession(fixtureURL: URL) {
        guard let coordinator = dictationCoordinator else {
            return
        }

        stopMicrophoneProbe()

        fixtureSessionTask?.cancel()
        fixtureSessionTask = Task { [weak self] in
            guard let self else {
                return
            }

            self.updateMenuBarStatus("Fixture dictation running...")

            let started = await coordinator.startFixtureDictation(fixtureURL: fixtureURL)
            guard started else {
                self.restoreIdleMenuBarStatus()
                return
            }

            self.hotKeyController?.enableCancelHotKey()
            await coordinator.waitForIdle()
            self.hotKeyController?.disableCancelHotKey()
            self.restoreIdleMenuBarStatus()
        }
    }

    @MainActor
    private func cancelDictationSession() {
        guard let coordinator = dictationCoordinator else {
            return
        }

        Task { [weak self] in
            guard let self else {
                return
            }

            let cancelled = await coordinator.cancelDictation()
            if cancelled {
                self.hotKeyController?.disableCancelHotKey()
                self.restoreIdleMenuBarStatus()
            }
        }
    }

    @MainActor
    private func finishDictationSession() {
        guard let coordinator = dictationCoordinator else {
            return
        }

        Task {
            _ = await coordinator.finishDictation()
        }
    }

    private func resolveFixtureURL() -> URL? {
        let relativeFixturePath = "Fixtures/hello-from-telnyx.wav"

        if FileManager.default.fileExists(atPath: relativeFixturePath) {
            return URL(fileURLWithPath: relativeFixturePath)
        }

        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let absoluteFixtureURL = packageRoot.appendingPathComponent(relativeFixturePath)

        guard FileManager.default.fileExists(atPath: absoluteFixtureURL.path) else {
            return nil
        }

        return absoluteFixtureURL
    }

    // MARK: - Permission Checks

    private func checkPermissions() {
        // Accessibility – synchronous check (no system prompt; user must add manually)
        if !permissionManager.isAccessibilityTrusted() {
            updateMenuBarStatus("Clipboard-only mode")
            showPermissionAlert(
                title: "Accessibility Access Recommended",
                message: """
                    Telnyx Link uses Accessibility to paste transcribed text into the active app.

                    Without it, text will be copied to the clipboard only (no auto-paste).

                    Grant access in System Settings → Privacy & Security → Accessibility.
                    """,
                settingsURL: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            )
        } else {
            restoreIdleMenuBarStatus()
        }
    }

    @MainActor
    private func reloadMicrophoneMenu() {
        guard let microphoneMenu else {
            return
        }

        microphoneMenu.removeAllItems()
        let devices = microphoneDeviceManager.inputDevices()

        let systemItem = NSMenuItem(title: "System Default", action: #selector(selectMicrophoneFromMenu(_:)), keyEquivalent: "")
        systemItem.target = self
        systemItem.state = selectedMicrophoneUID == nil ? .on : .off
        microphoneMenu.addItem(systemItem)

        if devices.isEmpty {
            let unavailable = NSMenuItem(title: "No microphones detected", action: nil, keyEquivalent: "")
            unavailable.isEnabled = false
            microphoneMenu.addItem(unavailable)
            return
        }

        microphoneMenu.addItem(NSMenuItem.separator())

        for device in devices {
            let item = NSMenuItem(title: device.name, action: #selector(selectMicrophoneFromMenu(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = device.uid
            item.state = device.uid == selectedMicrophoneUID ? .on : .off
            microphoneMenu.addItem(item)
        }
    }

    @MainActor
    private func reloadShortcutMenu() {
        guard let shortcutMenu else {
            return
        }

        shortcutMenu.removeAllItems()
        let selected = selectedShortcutMode()
        let options = [
            ("Hold fn", "hold-fn"),
            ("Cmd+Shift+L", "cmd-shift-l"),
        ]

        for option in options {
            let item = NSMenuItem(title: option.0, action: #selector(selectShortcutFromMenu(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = option.1
            item.state = option.1 == selected ? .on : .off
            shortcutMenu.addItem(item)
        }
    }

    @MainActor
    private func reloadLanguageMenu() {
        guard let languageMenu else {
            return
        }

        languageMenu.removeAllItems()
        let selected = selectedLanguage()
        for option in Self.languageOptions {
            let item = NSMenuItem(title: option.label, action: #selector(selectLanguageFromMenu(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = option.value
            item.state = option.value == selected ? .on : .off
            languageMenu.addItem(item)
        }
    }

    private func selectedShortcutMode() -> String {
        if let stored = UserDefaults.standard.string(forKey: Self.selectedShortcutModeDefaultsKey), !stored.isEmpty {
            return stored
        }
        return ProcessInfo.processInfo.environment["TELNYX_WHISPER_SHORTCUT_MODE"] ?? "hold-fn"
    }

    private func selectedLanguage() -> String {
        if let stored = UserDefaults.standard.string(forKey: Self.selectedLanguageDefaultsKey), !stored.isEmpty {
            return stored
        }
        return ProcessInfo.processInfo.environment["TELNYX_WHISPER_LANGUAGE"] ?? "en-US"
    }

    private func languageLabel(_ value: String) -> String {
        Self.languageOptions.first { $0.value == value }?.label ?? value
    }

    @MainActor
    private func updateFlowBarPreference() {
        showFlowBarMenuItem?.state = UserDefaults.standard.bool(forKey: Self.showFlowBarAlwaysDefaultsKey) ? .on : .off
        (hudPresenter as? MenuBarHUDPresenter)?.setFlowBarVisibleAtAllTimes(UserDefaults.standard.bool(forKey: Self.showFlowBarAlwaysDefaultsKey))
    }

    @MainActor
    private func applySelectedMicrophone(runProbe: Bool) {
        guard let audioCaptureEngine else {
            return
        }

        guard let selectedMicrophoneUID else {
            audioCaptureEngine.setPreferredInputDeviceID(nil)
            if runProbe {
                startMicrophoneProbe()
            }
            return
        }

        guard let device = microphoneDeviceManager.inputDevice(uid: selectedMicrophoneUID) else {
            self.selectedMicrophoneUID = nil
            UserDefaults.standard.removeObject(forKey: Self.selectedMicUIDDefaultsKey)
            audioCaptureEngine.setPreferredInputDeviceID(nil)
            if runProbe {
                startMicrophoneProbe()
            }
            return
        }

        audioCaptureEngine.setPreferredInputDeviceID(device.id)
        if runProbe {
            startMicrophoneProbe()
        }
    }

    @MainActor
    private func startMicrophoneProbe() {
        stopMicrophoneProbe()

        updateMenuBarIcon(mode: .listening)
        updateMenuBarStatus("Testing microphone...")
        hudPresenter?.update(state: .recording, transcript: "Requesting microphone access...")

        microphoneProbeTimeoutTask = Task { @MainActor [weak self] in
            guard let self else { return }

            // Request microphone permission before starting the engine.
            // Without this, AVAudioEngine starts but the input tap silently
            // delivers no audio on macOS 14+.
            let granted = await self.permissionManager.requestMicrophoneAccess()
            guard !Task.isCancelled else { return }
            guard granted else {
                self.hudPresenter?.update(
                    state: .idle,
                    transcript: "Microphone access denied. Enable in System Settings \u{2192} Privacy & Security \u{2192} Microphone."
                )
                self.updateMenuBarIcon(mode: .blocked)
                self.restoreIdleMenuBarStatus()
                return
            }

            let probe = AudioCaptureEngine()
            if let uid = self.selectedMicrophoneUID,
               let device = self.microphoneDeviceManager.inputDevice(uid: uid) {
                probe.setPreferredInputDeviceID(device.id)
            }

            do {
                try probe.start()
            } catch {
                self.showTransientHUDMessage("Microphone test failed to start: \(error)")
                self.restoreIdleMenuBarStatus()
                return
            }

            self.microphoneProbeEngine = probe
            self.microphoneProbeObservedSamples = false
            self.microphoneProbePeakPercent = 0
            self.hudPresenter?.update(state: .recording, transcript: "Microphone test active. Speak now.")

            self.microphoneProbeLevelTask = Task { [weak self] in
                for await level in probe.audioLevels {
                    guard !Task.isCancelled else { return }
                    await MainActor.run {
                        guard let self else { return }
                        let percent = max(0, min(100, Int((AudioMath.hudLevel(rms: level) / 10.0) * 100.0)))
                        self.microphoneProbeObservedSamples = true
                        self.microphoneProbePeakPercent = max(self.microphoneProbePeakPercent, percent)
                        self.hudPresenter?.update(level: level)
                        self.hudPresenter?.update(
                            state: .recording,
                            transcript: "Microphone test active. Level \(percent)% \u{2022} Peak \(self.microphoneProbePeakPercent)%"
                        )
                    }
                }
            }

            // Timeout: finish probe after 8 seconds.
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            guard !Task.isCancelled else { return }
            self.finishMicrophoneProbe()
        }
    }

    @MainActor
    private func finishMicrophoneProbe() {
        // Capture probe results BEFORE stopMicrophoneProbe() resets them.
        let observedSamples = microphoneProbeObservedSamples
        let peakPercent = microphoneProbePeakPercent
        stopMicrophoneProbe()

        let result: String
        if !observedSamples {
            result = "No microphone samples received. Check Input Microphone selection."
        } else if peakPercent < 3 {
            result = "Microphone heard almost nothing (peak \(peakPercent)%). Check mute/input gain."
        } else {
            result = "Microphone test complete (peak \(peakPercent)%). Start dictation when ready."
        }

        hudPresenter?.update(state: .idle, transcript: result)
        restoreIdleMenuBarStatus()
    }

    @MainActor
    private func stopMicrophoneProbe() {
        microphoneProbeTimeoutTask?.cancel()
        microphoneProbeTimeoutTask = nil
        microphoneProbeLevelTask?.cancel()
        microphoneProbeLevelTask = nil
        microphoneProbeEngine?.stop()
        microphoneProbeEngine = nil
        microphoneProbeObservedSamples = false
        microphoneProbePeakPercent = 0
    }

    @MainActor
    private func showRecentDictations(limit: Int) {
        let entries = recentSessionEntries(limit: limit)
        let body: String
        if entries.isEmpty {
            body = "No recent session results found yet."
        } else {
            body = entries.joined(separator: "\n")
        }

        let alert = NSAlert()
        alert.messageText = "Recent Dictations (Last \(limit))"
        alert.informativeText = body
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    private func lastTranscript() -> String? {
        let url = DictationLogPaths.aggregateLogURL()
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else {
            return nil
        }

        let decoder = JSONDecoder()
        return raw.split(separator: "\n").reversed().compactMap { line -> String? in
            guard let data = String(line).data(using: .utf8),
                  let entry = try? decoder.decode(DictationSessionLogEntry.self, from: data),
                  entry.stage == "session_result",
                  let transcript = entry.transcript?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !transcript.isEmpty
            else {
                return nil
            }
            return transcript
        }.first
    }

    private func recentSessionEntries(limit: Int) -> [String] {
        let url = DictationLogPaths.aggregateLogURL()
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else {
            return []
        }

        let decoder = JSONDecoder()
        let lines = raw.split(separator: "\n")
        let results = lines.compactMap { line -> DictationSessionLogEntry? in
            guard let data = String(line).data(using: .utf8) else {
                return nil
            }
            return try? decoder.decode(DictationSessionLogEntry.self, from: data)
        }
        .filter { $0.stage == "session_result" }
        .suffix(limit)
        .reversed()

        return results.map { entry in
            let shortID = String(entry.sessionID.prefix(8)).lowercased()
            let ts = shortTimestamp(entry.timestamp)
            let transcript = (entry.transcript?.isEmpty == false) ? " • \(entry.transcript!.prefix(36))" : ""
            return "[\(ts)] \(shortID) • \(entry.message)\(transcript)"
        }
    }

    private func shortTimestamp(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallbackParser = ISO8601DateFormatter()
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"

        if let date = parser.date(from: iso) ?? fallbackParser.date(from: iso) {
            return formatter.string(from: date)
        }
        return iso
    }

    private func updateMenuBarStatus(_ detail: String?) {
        let baseTitle = "Scribe"
        statusTitleMenuItem?.title = detail.map { "\(baseTitle) — \($0)" } ?? baseTitle
    }

    private func restoreIdleMenuBarStatus() {
        updateMenuBarIcon(mode: .normal)
        if permissionManager.isAccessibilityTrusted() {
            updateMenuBarStatus(nil)
        } else {
            updateMenuBarStatus("Clipboard-only mode")
        }
    }

    @MainActor
    private func showTransientHUDMessage(_ message: String) {
        hudFeedbackTask?.cancel()
        hudPresenter?.update(state: .idle, transcript: message)
        hudFeedbackTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            guard !Task.isCancelled else {
                return
            }
            self?.hudPresenter?.hide()
        }
    }

    @MainActor
    private func showLaunchConfirmation() {
        hudFeedbackTask?.cancel()

        let message: String
        if TelnyxAPIKeyResolver.resolve() == nil {
            updateMenuBarStatus("API key required")
            message = """
            Telnyx Link is running in the menu bar.

            TELNYX_API_KEY is not configured yet. Add it to ~/.config/telnyx-dictation/.env, then press Cmd+Shift+L to dictate.
            """
        } else {
            restoreIdleMenuBarStatus()
            message = """
            Telnyx Link is running in the menu bar.

            Press Cmd+Shift+L to start dictation, or use the microphone icon in the menu bar.
            """
        }

        hudPresenter?.update(state: .idle, transcript: message)
        hudFeedbackTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            guard !Task.isCancelled else {
                return
            }
            self?.hudPresenter?.hide()
        }
    }

    private func updateMenuBarIcon(mode: MenuBarIconMode) {
        guard let button = statusItem.button else {
            return
        }

        if mode == .blocked {
            if let image = NSImage(systemSymbolName: "mic.slash.fill", accessibilityDescription: "Microphone blocked") {
                image.isTemplate = true
                button.title = ""
                button.image = image
            } else {
                button.image = nil
                button.title = "🚫"
            }
            return
        }

        if mode == .listening {
            if let image = NSImage(systemSymbolName: "waveform", accessibilityDescription: "Listening") {
                image.isTemplate = true
                button.title = ""
                button.image = image
            } else {
                button.image = nil
                button.title = "◉"
            }
            return
        }

        if let image = NSImage(systemSymbolName: "waveform", accessibilityDescription: "Scribe") {
            image.isTemplate = true
            button.title = ""
            button.image = image
        } else {
            button.image = nil
            button.title = "S"
        }
    }

    // MARK: - Alerts

    private func showPermissionAlert(title: String, message: String, settingsURL: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Open System Settings")
        alert.addButton(withTitle: "Later")

        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            if let url = URL(string: settingsURL) {
                NSWorkspace.shared.open(url)
            }
        }
    }

    // MARK: - NSMenuDelegate

    public func menuWillOpen(_ menu: NSMenu) {
        startThresholdProbe()
    }

    public func menuDidClose(_ menu: NSMenu) {
        stopThresholdProbe()
        thresholdSliderView?.updateCurrentLevel(0)
    }
}
