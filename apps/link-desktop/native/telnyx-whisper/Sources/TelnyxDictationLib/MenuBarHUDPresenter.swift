import AppKit

@MainActor
final class MenuBarHUDPresenter: NSObject, HUDPresenting {
    private let statusButtonProvider: () -> NSStatusBarButton?
    private let popover = NSPopover()

    private let statusLabel = NSTextField(labelWithString: "Idle")
    private let transcriptLabel = NSTextField(labelWithString: "")
    private let barVisualizer = AudioBarVisualizerView(frame: .zero)
    private let historyHeaderLabel = NSTextField(labelWithString: "Recent")
    private let historyStack = NSStackView()
    private let historyContainer = NSView()
    private let closeButton = NSButton()
    private let flowBarWindow: NSPanel
    private let flowBarStatusLabel = NSTextField(labelWithString: "Ready")
    private let flowBarTranscriptLabel = NSTextField(labelWithString: "Hold fn and speak")
    private let flowBarVisualizer = AudioBarVisualizerView(frame: .zero)
    private var flowBarVisibleAtAllTimes = false

    /// Stored entries so click handlers can look up details.
    private var currentEntries: [RecentSessionEntry] = []

    /// Throttle transcript updates — only apply once per interval to avoid
    /// flooding the main thread during rapid partial-transcript streaming.
    private var pendingTranscriptUpdate: (DictationSession.State, String?)? = nil
    private var transcriptThrottleScheduled = false
    private static let transcriptThrottleInterval: TimeInterval = 0.08  // ~12 fps

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f
    }()

    init(statusButtonProvider: @escaping () -> NSStatusBarButton?) {
        self.statusButtonProvider = statusButtonProvider
        self.flowBarWindow = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 58),
            styleMask: [.nonactivatingPanel, .borderless],
            backing: .buffered,
            defer: false
        )
        super.init()
        setupPopoverContent()
        setupFlowBarContent()
    }

    nonisolated func update(state: DictationSession.State, transcript: String?) {
        Task { @MainActor in
            self.pendingTranscriptUpdate = (state, transcript)
            self.flushTranscriptUpdateIfNeeded()
        }
    }

    private func flushTranscriptUpdateIfNeeded() {
        guard !transcriptThrottleScheduled else { return }
        applyPendingTranscriptUpdate()

        transcriptThrottleScheduled = true
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.transcriptThrottleInterval) { [weak self] in
            guard let self else { return }
            self.transcriptThrottleScheduled = false
            if self.pendingTranscriptUpdate != nil {
                self.applyPendingTranscriptUpdate()
            }
        }
    }

    private func applyPendingTranscriptUpdate() {
        guard let (state, transcript) = pendingTranscriptUpdate else { return }
        pendingTranscriptUpdate = nil

        guard let button = statusButtonProvider() else { return }

        switch state {
        case .idle:
            statusLabel.stringValue = "Idle"
            // Keep popover open if there's a message to show (error/result).
            if (transcript ?? "").isEmpty {
                popover.behavior = .transient
            } else {
                popover.behavior = .applicationDefined
            }
        case .recording:
            statusLabel.stringValue = "Listening..."
            popover.behavior = .applicationDefined
        case .finalizing:
            statusLabel.stringValue = "Finalizing..."
            popover.behavior = .applicationDefined
        case .pasting:
            statusLabel.stringValue = "Pasting..."
            popover.behavior = .applicationDefined
        }

        transcriptLabel.stringValue = transcript ?? ""
        if state == .recording, (transcript ?? "").isEmpty {
            transcriptLabel.stringValue = "Waiting for transcript..."
        }
        if state != .recording {
            barVisualizer.resetToIdle()
        }
        updateFlowBar(state: state, transcript: transcript)

        show(relativeTo: button)
    }

    nonisolated func update(level: Float) {
        Task { @MainActor in
            barVisualizer.setLevel(level)
            flowBarVisualizer.setLevel(level)
        }
    }

    nonisolated func hide() {
        Task { @MainActor in
            popover.performClose(nil)
            if self.flowBarVisibleAtAllTimes {
                self.updateFlowBar(state: .idle, transcript: nil)
            } else {
                self.flowBarWindow.orderOut(nil)
            }
        }
    }

    func setFlowBarVisibleAtAllTimes(_ visible: Bool) {
        flowBarVisibleAtAllTimes = visible
        if visible {
            updateFlowBar(state: .idle, transcript: nil)
            showFlowBar()
        } else {
            flowBarWindow.orderOut(nil)
        }
    }

    @objc private func closeButtonClicked() {
        popover.performClose(nil)
    }

    nonisolated func updateRecentSessions(_ sessions: [RecentSessionEntry]) {
        Task { @MainActor in
            currentEntries = Array(sessions.prefix(5))
            rebuildHistoryRows()
        }
    }

    // MARK: - History rows

    private func rebuildHistoryRows() {
        // Remove old views.
        for view in historyStack.arrangedSubviews {
            historyStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        if currentEntries.isEmpty {
            historyContainer.isHidden = true
            refreshPopoverSize()
            return
        }

        historyContainer.isHidden = false

        for (index, entry) in currentEntries.enumerated() {
            let row = makeHistoryRow(for: entry, index: index)
            historyStack.addArrangedSubview(row)
            row.widthAnchor.constraint(equalTo: historyStack.widthAnchor).isActive = true
        }

        refreshPopoverSize()
    }

    private func makeHistoryRow(for entry: RecentSessionEntry, index: Int) -> NSView {
        let timeStr = Self.timeFormatter.string(from: entry.timestamp)
        let resultIcon = resultEmoji(for: entry.result)
        let preview: String
        if let t = entry.transcript, !t.isEmpty {
            preview = String(t.prefix(30))
        } else {
            preview = "(no transcript)"
        }

        let title = "\(resultIcon)  \(timeStr)  \(entry.result) — \(preview)"

        // Use a tracking area button for proper hover styling.
        let row = ClickableHistoryRow(frame: .zero)
        row.index = index
        row.onClick = { [weak self] idx in
            self?.historyRowClicked(at: idx)
        }
        row.configure(title: title)
        return row
    }

    private func historyRowClicked(at index: Int) {
        guard index >= 0, index < currentEntries.count else { return }
        let entry = currentEntries[index]
        showEntryDetail(entry)
    }

    private func showEntryDetail(_ entry: RecentSessionEntry) {
        let shortID = String(entry.sessionID.prefix(8)).lowercased()
        let timeStr = Self.timeFormatter.string(from: entry.timestamp)

        let fullDateFormatter = DateFormatter()
        fullDateFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let fullTime = fullDateFormatter.string(from: entry.timestamp)

        let resultIcon = resultEmoji(for: entry.result)

        var details = """
        Session:  \(shortID)  (\(entry.sessionID))
        Time:     \(fullTime)
        Result:   \(resultIcon) \(entry.result)
        """

        if let transcript = entry.transcript, !transcript.isEmpty {
            details += "\n\nTranscript:\n\(transcript)"
        } else {
            details += "\n\nTranscript: (none)"
        }

        if entry.result == "failed" {
            details += "\n\nNote: Check ~/Library/Logs/TelnyxDictation/sessions/\(entry.sessionID).log for full session trace."
        }

        let alert = NSAlert()
        alert.messageText = "Dictation [\(timeStr)] — \(entry.result)"
        alert.informativeText = details
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")

        if let transcript = entry.transcript, !transcript.isEmpty {
            alert.addButton(withTitle: "Copy Transcript")
        }

        let response = alert.runModal()
        if response == .alertSecondButtonReturn, let transcript = entry.transcript {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(transcript, forType: .string)
        }
    }

    private func resultEmoji(for result: String) -> String {
        switch result {
        case "pasted": return "✅"
        case "clipboard-only": return "📋"
        case "failed": return "❌"
        case let r where r.contains("cancel"): return "⏹"
        default: return "•"
        }
    }

    // MARK: - Popover setup

    private func setupPopoverContent() {
        let contentController = NSViewController()
        let contentView = NSView(frame: NSRect(x: 0, y: 0, width: 340, height: 200))

        statusLabel.font = .systemFont(ofSize: 12, weight: .semibold)
        statusLabel.textColor = .labelColor

        transcriptLabel.font = .systemFont(ofSize: 12, weight: .regular)
        transcriptLabel.textColor = .labelColor
        transcriptLabel.maximumNumberOfLines = 6
        transcriptLabel.lineBreakMode = .byWordWrapping
        transcriptLabel.preferredMaxLayoutWidth = 316  // 340 - 2*12 padding
        transcriptLabel.alignment = .left
        transcriptLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        // Configure the bar visualizer
        barVisualizer.barCount = 24
        barVisualizer.barSpacing = 2.0
        barVisualizer.barCornerRadius = 2.0
        barVisualizer.barColor = .controlAccentColor
        barVisualizer.translatesAutoresizingMaskIntoConstraints = false

        // History section
        historyHeaderLabel.font = .systemFont(ofSize: 11, weight: .semibold)
        historyHeaderLabel.textColor = .tertiaryLabelColor

        historyStack.orientation = .vertical
        historyStack.spacing = 3
        historyStack.alignment = .leading
        historyStack.translatesAutoresizingMaskIntoConstraints = false

        historyContainer.translatesAutoresizingMaskIntoConstraints = false
        historyContainer.isHidden = true

        let historyInnerStack = NSStackView(views: [historyHeaderLabel, historyStack])
        historyInnerStack.orientation = .vertical
        historyInnerStack.spacing = 4
        historyInnerStack.alignment = .leading
        historyInnerStack.translatesAutoresizingMaskIntoConstraints = false
        historyContainer.addSubview(historyInnerStack)
        NSLayoutConstraint.activate([
            historyInnerStack.leadingAnchor.constraint(equalTo: historyContainer.leadingAnchor),
            historyInnerStack.trailingAnchor.constraint(equalTo: historyContainer.trailingAnchor),
            historyInnerStack.topAnchor.constraint(equalTo: historyContainer.topAnchor),
            historyInnerStack.bottomAnchor.constraint(equalTo: historyContainer.bottomAnchor),
        ])

        let mainStack = NSStackView(views: [statusLabel, barVisualizer, transcriptLabel, historyContainer])
        mainStack.orientation = .vertical
        mainStack.spacing = 8
        mainStack.alignment = .leading
        mainStack.translatesAutoresizingMaskIntoConstraints = false

        // Close button — top-right corner
        closeButton.bezelStyle = .circular
        closeButton.image = NSImage(systemSymbolName: "xmark", accessibilityDescription: "Close")
        closeButton.imagePosition = .imageOnly
        closeButton.isBordered = false
        closeButton.target = self
        closeButton.action = #selector(closeButtonClicked)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.setContentHuggingPriority(.required, for: .horizontal)
        closeButton.setContentHuggingPriority(.required, for: .vertical)
        contentView.addSubview(closeButton)

        contentView.addSubview(mainStack)
        NSLayoutConstraint.activate([
            mainStack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 12),
            mainStack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -12),
            mainStack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 10),
            mainStack.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -10),
            barVisualizer.widthAnchor.constraint(equalTo: mainStack.widthAnchor),
            barVisualizer.heightAnchor.constraint(equalToConstant: 48),
            historyContainer.widthAnchor.constraint(equalTo: mainStack.widthAnchor),
            transcriptLabel.widthAnchor.constraint(equalTo: mainStack.widthAnchor),
            closeButton.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 6),
            closeButton.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -6),
            closeButton.widthAnchor.constraint(equalToConstant: 18),
            closeButton.heightAnchor.constraint(equalToConstant: 18),
        ])

        contentController.view = contentView
        popover.behavior = .transient
        popover.animates = true
        popover.contentSize = contentView.frame.size
        popover.contentViewController = contentController
        refreshPopoverSize()
    }

    private func setupFlowBarContent() {
        flowBarWindow.isFloatingPanel = true
        flowBarWindow.level = NSWindow.Level(Int(CGWindowLevelForKey(.floatingWindow)) + 2)
        flowBarWindow.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        flowBarWindow.backgroundColor = .clear
        flowBarWindow.isOpaque = false
        flowBarWindow.hasShadow = true
        flowBarWindow.hidesOnDeactivate = false
        flowBarWindow.isReleasedWhenClosed = false

        let contentView = NSView(frame: NSRect(x: 0, y: 0, width: 520, height: 58))
        flowBarWindow.contentView = contentView

        let effectView = NSVisualEffectView()
        effectView.material = .hudWindow
        effectView.blendingMode = .behindWindow
        effectView.state = .active
        effectView.wantsLayer = true
        effectView.layer?.cornerRadius = 20
        effectView.layer?.masksToBounds = true
        effectView.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(effectView)

        let icon = NSImageView()
        icon.image = NSImage(systemSymbolName: "waveform", accessibilityDescription: "Scribe")
        icon.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
        icon.contentTintColor = .labelColor
        icon.translatesAutoresizingMaskIntoConstraints = false

        flowBarStatusLabel.font = .systemFont(ofSize: 12, weight: .semibold)
        flowBarStatusLabel.textColor = .labelColor
        flowBarStatusLabel.setContentHuggingPriority(.required, for: .horizontal)

        flowBarTranscriptLabel.font = .systemFont(ofSize: 12, weight: .regular)
        flowBarTranscriptLabel.textColor = .secondaryLabelColor
        flowBarTranscriptLabel.lineBreakMode = .byTruncatingTail
        flowBarTranscriptLabel.maximumNumberOfLines = 1

        flowBarVisualizer.barCount = 18
        flowBarVisualizer.barSpacing = 2.0
        flowBarVisualizer.barCornerRadius = 2.0
        flowBarVisualizer.barColor = .controlAccentColor
        flowBarVisualizer.translatesAutoresizingMaskIntoConstraints = false

        let textStack = NSStackView(views: [flowBarStatusLabel, flowBarTranscriptLabel])
        textStack.orientation = .vertical
        textStack.spacing = 1
        textStack.alignment = .leading
        textStack.translatesAutoresizingMaskIntoConstraints = false

        let stack = NSStackView(views: [icon, textStack, flowBarVisualizer])
        stack.orientation = .horizontal
        stack.alignment = .centerY
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        effectView.addSubview(stack)

        NSLayoutConstraint.activate([
            effectView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            effectView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            effectView.topAnchor.constraint(equalTo: contentView.topAnchor),
            effectView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: effectView.leadingAnchor, constant: 14),
            stack.trailingAnchor.constraint(equalTo: effectView.trailingAnchor, constant: -14),
            stack.topAnchor.constraint(equalTo: effectView.topAnchor, constant: 10),
            stack.bottomAnchor.constraint(equalTo: effectView.bottomAnchor, constant: -10),
            icon.widthAnchor.constraint(equalToConstant: 24),
            icon.heightAnchor.constraint(equalToConstant: 24),
            flowBarVisualizer.widthAnchor.constraint(equalToConstant: 120),
            flowBarVisualizer.heightAnchor.constraint(equalToConstant: 34),
            textStack.widthAnchor.constraint(greaterThanOrEqualToConstant: 220),
        ])

        positionFlowBar()
    }

    private func show(relativeTo button: NSStatusBarButton) {
        if popover.isShown {
            return
        }
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        // Keep the popover visible without stealing focus from the user's active app.
        // makeKey() was here before but it pulled keyboard focus to our process,
        // so Cmd+V would paste into the wrong window.
        if let popoverWindow = popover.contentViewController?.view.window {
            popoverWindow.level = .floating
        }
    }

    private func refreshPopoverSize() {
        let rowHeight: CGFloat = 28
        let rowCount = CGFloat(currentEntries.count)
        let historyHeight: CGFloat = historyContainer.isHidden ? 0 : (24 + rowCount * rowHeight + 8)
        let targetHeight: CGFloat = 150 + historyHeight
        popover.contentSize = NSSize(width: 340, height: targetHeight)
        popover.contentViewController?.view.frame.size = popover.contentSize
    }

    private func updateFlowBar(state: DictationSession.State, transcript: String?) {
        switch state {
        case .idle:
            flowBarStatusLabel.stringValue = "Ready"
            flowBarTranscriptLabel.stringValue = transcript?.isEmpty == false ? transcript! : "Hold fn and speak"
            flowBarVisualizer.resetToIdle()
        case .recording:
            flowBarStatusLabel.stringValue = "Listening"
            flowBarTranscriptLabel.stringValue = transcript?.isEmpty == false ? transcript! : "Waiting for transcript..."
        case .finalizing:
            flowBarStatusLabel.stringValue = "Finalizing"
            flowBarTranscriptLabel.stringValue = transcript?.isEmpty == false ? transcript! : "Preparing transcript..."
            flowBarVisualizer.resetToIdle()
        case .pasting:
            flowBarStatusLabel.stringValue = "Pasting"
            flowBarTranscriptLabel.stringValue = transcript?.isEmpty == false ? transcript! : "Sending text to the active app..."
            flowBarVisualizer.resetToIdle()
        }

        if flowBarVisibleAtAllTimes || state != .idle || transcript?.isEmpty == false {
            showFlowBar()
        }
    }

    private func showFlowBar() {
        positionFlowBar()
        if !flowBarWindow.isVisible {
            flowBarWindow.alphaValue = 0
            flowBarWindow.orderFrontRegardless()
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.16
                flowBarWindow.animator().alphaValue = 1
            }
        }
    }

    private func positionFlowBar() {
        guard let screen = NSScreen.main else {
            return
        }

        let frame = screen.visibleFrame
        let size = flowBarWindow.frame.size
        let origin = NSPoint(
            x: frame.midX - size.width / 2,
            y: frame.minY + 18
        )
        flowBarWindow.setFrameOrigin(origin)
    }
}

// MARK: - Clickable history row with hover highlight

@MainActor
private final class ClickableHistoryRow: NSView {
    var index: Int = 0
    var onClick: ((Int) -> Void)?

    private let label = NSTextField(labelWithString: "")
    private let chevron = NSTextField(labelWithString: "›")
    private var isHovered = false
    private var trackingArea: NSTrackingArea?

    func configure(title: String) {
        wantsLayer = true
        layer?.cornerRadius = 5
        layer?.borderWidth = 0.5
        layer?.borderColor = NSColor.separatorColor.cgColor
        layer?.backgroundColor = NSColor.controlBackgroundColor.withAlphaComponent(0.45).cgColor

        label.font = .systemFont(ofSize: 11, weight: .regular)
        label.textColor = .labelColor
        label.lineBreakMode = .byTruncatingTail
        label.maximumNumberOfLines = 1
        label.translatesAutoresizingMaskIntoConstraints = false
        label.stringValue = title

        chevron.font = .systemFont(ofSize: 13, weight: .medium)
        chevron.textColor = .tertiaryLabelColor
        chevron.translatesAutoresizingMaskIntoConstraints = false
        chevron.setContentHuggingPriority(.required, for: .horizontal)
        chevron.setContentCompressionResistancePriority(.required, for: .horizontal)

        addSubview(label)
        addSubview(chevron)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
            label.trailingAnchor.constraint(lessThanOrEqualTo: chevron.leadingAnchor, constant: -4),
            chevron.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            chevron.centerYAnchor.constraint(equalTo: centerYAnchor),
            heightAnchor.constraint(equalToConstant: 24),
        ])

        updateTrackingAreas()
    }

    override func updateTrackingAreas() {
        if let existing = trackingArea {
            removeTrackingArea(existing)
        }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        trackingArea = area
        super.updateTrackingAreas()
    }

    override func mouseEntered(with event: NSEvent) {
        isHovered = true
        layer?.backgroundColor = NSColor.controlAccentColor.withAlphaComponent(0.14).cgColor
        layer?.borderColor = NSColor.controlAccentColor.withAlphaComponent(0.35).cgColor
        chevron.textColor = .secondaryLabelColor
        NSCursor.pointingHand.push()
    }

    override func mouseExited(with event: NSEvent) {
        isHovered = false
        layer?.backgroundColor = NSColor.controlBackgroundColor.withAlphaComponent(0.45).cgColor
        layer?.borderColor = NSColor.separatorColor.cgColor
        chevron.textColor = .tertiaryLabelColor
        NSCursor.pop()
    }

    override func mouseDown(with event: NSEvent) {
        layer?.backgroundColor = NSColor.controlAccentColor.withAlphaComponent(0.25).cgColor
    }

    override func mouseUp(with event: NSEvent) {
        layer?.backgroundColor = isHovered
            ? NSColor.controlAccentColor.withAlphaComponent(0.14).cgColor
            : NSColor.controlBackgroundColor.withAlphaComponent(0.45).cgColor
        // Only trigger if mouse is still inside.
        let loc = convert(event.locationInWindow, from: nil)
        if bounds.contains(loc) {
            onClick?(index)
        }
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }
}
