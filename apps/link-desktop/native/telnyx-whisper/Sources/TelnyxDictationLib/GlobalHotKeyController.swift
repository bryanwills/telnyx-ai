import AppKit
import Carbon

final class GlobalHotKeyController {
    enum ShortcutMode {
        case holdFunction
        case commandShiftL

        init(environmentValue: String?) {
            switch environmentValue {
            case "cmd-shift-l":
                self = .commandShiftL
            default:
                self = .holdFunction
            }
        }
    }

    private static let lKeyCode: UInt16 = 37  // "L" key on US keyboard
    private static let escapeKeyCode: UInt16 = 53

    private static var nextHotKeyID: UInt32 = 1
    private static var registeredControllers: [UInt32: WeakControllerBox] = [:]
    private static var eventHandlerRef: EventHandlerRef?

    private final class WeakControllerBox {
        weak var controller: GlobalHotKeyController?

        init(_ controller: GlobalHotKeyController) {
            self.controller = controller
        }
    }

    private var hotKeyRef: EventHotKeyRef?
    private var hotKeyRegistrationID: UInt32?
    private var escapeGlobalMonitor: Any?
    private var escapeLocalMonitor: Any?
    private var flagsGlobalMonitor: Any?
    private var flagsLocalMonitor: Any?
    private var cancelHotKeyEnabled = false
    private var functionKeyIsDown = false
    /// Minimum interval between accepted hot-key presses (seconds).
    /// Carbon `kEventHotKeyPressed` fires on key-repeat; without a
    /// debounce every repeat spawns a new dictation attempt.
    private static let debounceInterval: TimeInterval = 0.5
    private var lastStartFireTime: TimeInterval = 0

    private let onStart: () -> Void
    private let onFinish: () -> Void
    private let onCancel: () -> Void
    private let shortcutMode: ShortcutMode

    init(shortcutMode: ShortcutMode, onStart: @escaping () -> Void, onFinish: @escaping () -> Void, onCancel: @escaping () -> Void) {
        self.shortcutMode = shortcutMode
        self.onStart = onStart
        self.onFinish = onFinish
        self.onCancel = onCancel
    }

    deinit {
        stopMonitoring()
    }

    func startMonitoring() {
        guard hotKeyRef == nil else {
            return
        }

        ensureEventHandlerInstalled()
        if shortcutMode == .commandShiftL {
            registerStartHotKey()
        }
        escapeGlobalMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            _ = self?.handleEscape(event: event)
        }
        escapeLocalMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else {
                return event
            }

            let consumed = self.handleEscape(event: event)
            return consumed ? nil : event
        }
        flagsGlobalMonitor = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            self?.handleModifierFlagsChanged(event: event)
        }
        flagsLocalMonitor = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            self?.handleModifierFlagsChanged(event: event)
            return event
        }
    }

    func stopMonitoring() {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
            self.hotKeyRef = nil
        }

        if let hotKeyRegistrationID {
            Self.registeredControllers.removeValue(forKey: hotKeyRegistrationID)
            self.hotKeyRegistrationID = nil
        }

        if let escapeGlobalMonitor {
            NSEvent.removeMonitor(escapeGlobalMonitor)
            self.escapeGlobalMonitor = nil
        }

        if let escapeLocalMonitor {
            NSEvent.removeMonitor(escapeLocalMonitor)
            self.escapeLocalMonitor = nil
        }

        if let flagsGlobalMonitor {
            NSEvent.removeMonitor(flagsGlobalMonitor)
            self.flagsGlobalMonitor = nil
        }

        if let flagsLocalMonitor {
            NSEvent.removeMonitor(flagsLocalMonitor)
            self.flagsLocalMonitor = nil
        }

        functionKeyIsDown = false
    }

    func enableCancelHotKey() {
        cancelHotKeyEnabled = true
    }

    func disableCancelHotKey() {
        cancelHotKeyEnabled = false
    }

    private func registerStartHotKey() {
        let id = Self.nextHotKeyID
        Self.nextHotKeyID += 1

        let hotKeyID = EventHotKeyID(signature: OSType(0x54445844), id: id)
        let modifiers = UInt32(cmdKey | shiftKey)

        let status = RegisterEventHotKey(
            UInt32(Self.lKeyCode),
            modifiers,
            hotKeyID,
            GetEventDispatcherTarget(),
            0,
            &hotKeyRef
        )

        if status == noErr {
            hotKeyRegistrationID = id
            Self.registeredControllers[id] = WeakControllerBox(self)
        }
    }

    private func ensureEventHandlerInstalled() {
        guard GlobalHotKeyController.eventHandlerRef == nil else {
            return
        }

        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )

        InstallEventHandler(
            GetEventDispatcherTarget(),
            { _, eventRef, _ in
                guard let eventRef else {
                    return noErr
                }

                var hotKeyID = EventHotKeyID()
                let result = GetEventParameter(
                    eventRef,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &hotKeyID
                )

                guard result == noErr,
                      let box = GlobalHotKeyController.registeredControllers[hotKeyID.id],
                      let controller = box.controller else {
                    return noErr
                }

                controller.fireStart()
                return noErr
            },
            1,
            &eventType,
            nil,
            &GlobalHotKeyController.eventHandlerRef
        )
    }

    @discardableResult
    private func handleEscape(event: NSEvent) -> Bool {
        if event.isARepeat {
            return false
        }

        let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)

        if cancelHotKeyEnabled,
           event.keyCode == Self.escapeKeyCode,
           modifiers.isEmpty {
            onCancel()
            return true
        }

        return false
    }

    private func fireStart() {
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastStartFireTime >= GlobalHotKeyController.debounceInterval else {
            return
        }
        lastStartFireTime = now
        onStart()
    }

    private func handleModifierFlagsChanged(event: NSEvent) {
        guard shortcutMode == .holdFunction else {
            return
        }

        let functionPressed = event.modifierFlags.contains(.function)

        if functionPressed && !functionKeyIsDown {
            functionKeyIsDown = true
            fireStart()
            return
        }

        if !functionPressed && functionKeyIsDown {
            functionKeyIsDown = false
            onFinish()
        }
    }
}
