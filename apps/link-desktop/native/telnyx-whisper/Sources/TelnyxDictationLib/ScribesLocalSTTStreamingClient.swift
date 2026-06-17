import Foundation

public enum ScribesLocalSTTError: Error, Equatable, Sendable {
    case missingEndpoint
    case invalidEndpoint
    case missingToken
    case requestFailed(Int)
    case emptyTranscript
}

public final class ScribesLocalSTTStreamingClient: STTStreaming, @unchecked Sendable {
    public private(set) var transcriptEvents: AsyncStream<STTTranscriptEvent>
    private var continuation: AsyncStream<STTTranscriptEvent>.Continuation
    private var audioBuffer = Data()

    private let endpointProvider: () -> String?
    private let tokenProvider: () -> String?
    private let provider: String
    private let model: String
    private let language: String
    private let urlSession: URLSession

    public convenience init() {
        let environment = ProcessInfo.processInfo.environment
        self.init(
            endpointProvider: { environment["TELNYX_WHISPER_SCRIBES_ENDPOINT"] },
            tokenProvider: { environment["TELNYX_WHISPER_SCRIBES_TOKEN"] },
            provider: environment["TELNYX_WHISPER_STT_ENGINE"] ?? "openai-whisper",
            model: environment["TELNYX_WHISPER_STT_MODEL"] ?? "whisper.cpp/base",
            language: environment["TELNYX_WHISPER_LANGUAGE"] ?? "en-US"
        )
    }

    init(
        endpointProvider: @escaping () -> String?,
        tokenProvider: @escaping () -> String?,
        provider: String,
        model: String,
        language: String,
        urlSession: URLSession = .shared
    ) {
        self.endpointProvider = endpointProvider
        self.tokenProvider = tokenProvider
        self.provider = provider
        self.model = model
        self.language = language
        self.urlSession = urlSession
        var cont: AsyncStream<STTTranscriptEvent>.Continuation!
        self.transcriptEvents = AsyncStream { continuation in
            cont = continuation
        }
        self.continuation = cont
    }

    public func connect() async throws {
        guard endpointProvider()?.isEmpty == false else {
            throw ScribesLocalSTTError.missingEndpoint
        }
        guard tokenProvider()?.isEmpty == false else {
            throw ScribesLocalSTTError.missingToken
        }
        audioBuffer.removeAll(keepingCapacity: true)
        var cont: AsyncStream<STTTranscriptEvent>.Continuation!
        self.transcriptEvents = AsyncStream { continuation in
            cont = continuation
        }
        self.continuation = cont
    }

    public func sendAudioFrame(_ frame: Data) async throws {
        audioBuffer.append(frame)
    }

    public func finishAudio() async throws {
        guard let endpoint = endpointProvider(), !endpoint.isEmpty else {
            throw ScribesLocalSTTError.missingEndpoint
        }
        guard let token = tokenProvider(), !token.isEmpty else {
            throw ScribesLocalSTTError.missingToken
        }
        guard var components = URLComponents(string: endpoint) else {
            throw ScribesLocalSTTError.invalidEndpoint
        }
        components.queryItems = [
            URLQueryItem(name: "provider", value: provider),
            URLQueryItem(name: "model", value: model),
            URLQueryItem(name: "language", value: language),
        ]
        guard let url = components.url else {
            throw ScribesLocalSTTError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("audio/wav", forHTTPHeaderField: "Content-Type")
        request.setValue(token, forHTTPHeaderField: "X-Scribes-Token")
        request.httpBody = audioBuffer

        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ScribesLocalSTTError.requestFailed(0)
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw ScribesLocalSTTError.requestFailed(httpResponse.statusCode)
        }
        let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let transcript = (payload?["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !transcript.isEmpty else {
            throw ScribesLocalSTTError.emptyTranscript
        }
        continuation.yield(.final(transcript))
    }

    public func disconnect() async {
        audioBuffer.removeAll(keepingCapacity: false)
        continuation.finish()
    }
}

public enum ScribesSTTStreamingFactory {
    public static func makeStreamingClient(environment: [String: String] = ProcessInfo.processInfo.environment, language: String? = nil) -> any STTStreaming {
        if environment["TELNYX_WHISPER_STT_MODE"] == "local" {
            return ScribesLocalSTTStreamingClient(
                endpointProvider: { environment["TELNYX_WHISPER_SCRIBES_ENDPOINT"] },
                tokenProvider: { environment["TELNYX_WHISPER_SCRIBES_TOKEN"] },
                provider: environment["TELNYX_WHISPER_STT_ENGINE"] ?? "openai-whisper",
                model: environment["TELNYX_WHISPER_STT_MODEL"] ?? "whisper.cpp/base",
                language: language ?? environment["TELNYX_WHISPER_LANGUAGE"] ?? "en-US"
            )
        }
        return TelnyxSTTStreamingClient(
            apiKeyProvider: { TelnyxAPIKeyResolver.resolve() },
            languageProvider: { language ?? environment["TELNYX_WHISPER_LANGUAGE"] ?? "en-US" },
            transportFactory: { request in
                URLSessionWebSocketTransport(request: request) { line in
                    TelnyxSTTStreamingClient.appendDebugLine(line)
                }
            }
        )
    }
}
