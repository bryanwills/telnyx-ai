import Foundation

// MARK: - WebSocket Transport Abstraction

/// Message types exchanged over WebSocket.
enum WebSocketMessage: Sendable, Equatable {
    case string(String)
    case data(Data)
}

/// Abstraction over WebSocket for testability.
/// Production uses URLSessionWebSocketTask; tests inject a mock.
protocol WebSocketTransport: Sendable {
    func send(_ message: WebSocketMessage) async throws
    func receive() async throws -> WebSocketMessage
    func resume()
    func cancel()
}

// MARK: - URLSession-based Transport (Production)

final class URLSessionWebSocketTransport: NSObject, WebSocketTransport,
    URLSessionWebSocketDelegate, @unchecked Sendable
{
    private var session: URLSession!
    private var task: URLSessionWebSocketTask!
    private let debugLog: (String) -> Void

    init(request: URLRequest, debugLog: @escaping (String) -> Void = { _ in }) {
        self.debugLog = debugLog
        super.init()
        self.session = URLSession(
            configuration: .default,
            delegate: self,
            delegateQueue: nil
        )
        self.task = session.webSocketTask(with: request)
    }

    func send(_ message: WebSocketMessage) async throws {
        switch message {
        case .string(let s):
            try await task.send(.string(s))
        case .data(let d):
            try await task.send(.data(d))
        }
    }

    func receive() async throws -> WebSocketMessage {
        let msg = try await task.receive()
        switch msg {
        case .string(let s):
            debugLog("WS recv text (\(s.count) chars): \(s.prefix(300))")
            return .string(s)
        case .data(let d):
            debugLog("WS recv data (\(d.count) bytes)")
            return .data(d)
        @unknown default:
            return .data(Data())
        }
    }

    func resume() {
        task.resume()
    }

    func cancel() {
        task.cancel(with: .normalClosure, reason: nil)
    }

    // MARK: - URLSessionWebSocketDelegate

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        debugLog("WS opened (protocol: \(`protocol` ?? "none"))")
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        let reasonStr = reason.flatMap { String(data: $0, encoding: .utf8) } ?? "none"
        debugLog("WS closed (code: \(closeCode.rawValue), reason: \(reasonStr))")
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: (any Error)?
    ) {
        if let error {
            debugLog("WS task completed with error: \(error)")
        }
    }
}

// MARK: - Errors

public enum TelnyxSTTError: Error, Equatable, Sendable {
    case missingAPIKey
    case invalidURL
    case notConnected
}

// MARK: - Telnyx STT Streaming Client

/// Production `STTStreaming` implementation backed by URLSessionWebSocketTask.
/// Connects to Telnyx STT endpoint with Deepgram/nova-3 engine (validated working).
/// API key is read from `TELNYX_API_KEY` environment variable.
public final class TelnyxSTTStreamingClient: STTStreaming, @unchecked Sendable {

    public private(set) var transcriptEvents: AsyncStream<STTTranscriptEvent>
    private var continuation: AsyncStream<STTTranscriptEvent>.Continuation

    private var transport: WebSocketTransport?
    private var receiveTask: Task<Void, Never>?

    private let apiKeyProvider: () -> String?
    private let languageProvider: () -> String
    private let transportFactory: (URLRequest) -> WebSocketTransport

    // MARK: - Endpoint

    static let endpoint = "wss://api.telnyx.com/v2/speech-to-text/transcription"

    // MARK: - Init

    /// Production initializer. Reads `TELNYX_API_KEY` from environment, uses URLSessionWebSocketTask.
    public convenience init() {
        self.init(
            apiKeyProvider: { TelnyxAPIKeyResolver.resolve() },
            languageProvider: { ProcessInfo.processInfo.environment["TELNYX_WHISPER_LANGUAGE"] ?? "en-US" },
            transportFactory: { request in
                URLSessionWebSocketTransport(request: request) { line in
                    TelnyxSTTStreamingClient.appendDebugLine(line)
                }
            }
        )
    }

    /// Internal initializer for testing with injectable dependencies.
    init(
        apiKeyProvider: @escaping () -> String?,
        languageProvider: @escaping () -> String = { "en-US" },
        transportFactory: @escaping (URLRequest) -> WebSocketTransport
    ) {
        self.apiKeyProvider = apiKeyProvider
        self.languageProvider = languageProvider
        self.transportFactory = transportFactory
        var cont: AsyncStream<STTTranscriptEvent>.Continuation!
        self.transcriptEvents = AsyncStream { continuation in
            cont = continuation
        }
        self.continuation = cont
    }

    // MARK: - STTStreaming

    public func connect() async throws {
        // Create a fresh stream for each session so callers never see a
        // finished continuation left over from a previous disconnect().
        var cont: AsyncStream<STTTranscriptEvent>.Continuation!
        self.transcriptEvents = AsyncStream { continuation in
            cont = continuation
        }
        self.continuation = cont
        self.sendCount = 0
        self.totalBytesSent = 0

        guard let apiKey = apiKeyProvider(), !apiKey.isEmpty else {
            throw TelnyxSTTError.missingAPIKey
        }

        var components = URLComponents(string: Self.endpoint)!
        components.queryItems = [
            URLQueryItem(name: "transcription_engine", value: "Deepgram"),
            URLQueryItem(name: "model", value: "deepgram/nova-3"),
            URLQueryItem(name: "input_format", value: "wav"),
            URLQueryItem(name: "interim_results", value: "true"),
            URLQueryItem(name: "language", value: languageProvider()),
        ]

        guard let url = components.url else {
            throw TelnyxSTTError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let ws = transportFactory(request)
        self.transport = ws

        // CRITICAL: Start receive loop BEFORE resume() to avoid missing early messages.
        // Learned from Task 3 spike — URLSessionWebSocketTask can deliver messages immediately.
        receiveTask = Task { [weak self] in
            await self?.receiveLoop(ws)
        }

        ws.resume()
    }

    private var sendCount = 0
    private var totalBytesSent = 0

    public func sendAudioFrame(_ frame: Data) async throws {
        guard let transport = transport else {
            throw TelnyxSTTError.notConnected
        }
        sendCount += 1
        totalBytesSent += frame.count
        if sendCount <= 3 || sendCount % 50 == 0 {
            Self.appendDebugLine("sendAudioFrame #\(sendCount): \(frame.count) bytes (total: \(totalBytesSent))")
        }
        try await transport.send(.data(frame))
    }

    public func disconnect() async {
        receiveTask?.cancel()
        receiveTask = nil
        transport?.cancel()
        transport = nil
        continuation.finish()
    }

    // MARK: - Receive Loop

    /// Continuously receives WebSocket messages, parses transcript JSON,
    /// and yields `.partial` / `.final` events to the `transcriptEvents` stream.
    ///
    /// JSON format (from Telnyx/Deepgram):
    /// ```json
    /// {"transcript": "Hello", "is_final": false, "confidence": 0.74, "speech_final": false}
    /// {"transcript": "Hello from Telnyx.", "is_final": true, "confidence": 0.81, "speech_final": true}
    /// ```
    private func receiveLoop(_ ws: WebSocketTransport) async {
        while !Task.isCancelled {
            do {
                let message = try await ws.receive()
                if let event = Self.parseTranscriptEvent(from: message) {
                    continuation.yield(event)
                }
            } catch {
                Self.appendDebugLine("receiveLoop error: \(error)")
                break
            }
        }
        continuation.finish()
    }

    // MARK: - Transcript Parsing

    /// Parses a WebSocket message into an `STTTranscriptEvent`, if applicable.
    /// Returns `nil` for non-transcript messages, errors, or empty finals.
    static func parseTranscriptEvent(from message: WebSocketMessage) -> STTTranscriptEvent? {
        let text: String
        switch message {
        case .string(let s):
            text = s
        case .data(let d):
            guard let s = String(data: d, encoding: .utf8) else { return nil }
            text = s
        }

        guard let jsonData = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
              let transcript = Self.extractTranscript(from: json) else {
            return nil
        }

        let isFinal = json["is_final"] as? Bool ?? false

        // Skip empty finals — trailing events with no content
        if isFinal && transcript.isEmpty {
            return nil
        }

        return isFinal ? .final(transcript) : .partial(transcript)
    }

    private static func extractTranscript(from json: [String: Any]) -> String? {
        if let transcript = json["transcript"] as? String {
            return transcript
        }

        if let channel = json["channel"] as? [String: Any],
           let alternatives = channel["alternatives"] as? [[String: Any]],
           let first = alternatives.first,
           let transcript = first["transcript"] as? String {
            return transcript
        }

        return nil
    }

    static func appendDebugLine(_ line: String) {
        let fileURL = DictationLogPaths.baseDirectory().appendingPathComponent("stt-debug.log")
        let payload = Data(("[\(ISO8601DateFormatter().string(from: Date()))] \(line)\n").utf8)

        do {
            try FileManager.default.createDirectory(at: DictationLogPaths.baseDirectory(), withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: fileURL.path) {
                try payload.write(to: fileURL, options: .atomic)
                return
            }

            let handle = try FileHandle(forWritingTo: fileURL)
            defer { try? handle.close() }
            try handle.seekToEnd()
            try handle.write(contentsOf: payload)
        } catch {
        }
    }
}
