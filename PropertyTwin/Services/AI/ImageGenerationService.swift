import Foundation

enum ImageGenerationStyle: String, CaseIterable, Identifiable, Codable {
    case contemporary = "Contemporain"
    case minimalist = "Minimaliste"
    case scandinavian = "Scandinave"
    case parisian = "Parisien"
    case japandi = "Japandi"
    case classic = "Classique"
    case industrial = "Industriel"
    var id: String { rawValue }
}

struct ImageGenerationRequest: Sendable {
    let sourceImageData: Data
    let action: DesignAction
    let style: String
    let prompt: String
}

protocol ImageGenerationProvider: Sendable {
    var isConfigured: Bool { get }
    var displayName: String { get }
    func generate(_ request: ImageGenerationRequest) async throws -> Data
}

enum ImageGenerationError: LocalizedError {
    case notConfigured
    case invalidEndpoint
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Fonction IA non configurée. Renseignez l’URL HTTPS de votre backend IA dans Profil."
        case .invalidEndpoint: "L’adresse du backend IA doit être une URL HTTPS valide."
        case .invalidResponse: "La génération n’a pas produit d’image exploitable."
        case .server(let message): message
        }
    }
}

struct UnconfiguredImageProvider: ImageGenerationProvider {
    let isConfigured = false
    let displayName = "IA à connecter"
    func generate(_ request: ImageGenerationRequest) async throws -> Data {
        throw ImageGenerationError.notConfigured
    }
}

/// Provider production-safe: the Apple app sends the source image to your backend.
/// The backend owns the provider credential (OpenAI or another model); no API key ships in the app.
struct BackendImageProvider: ImageGenerationProvider {
    let endpoint: URL
    var session: URLSession = .shared

    var isConfigured: Bool { endpoint.scheme?.lowercased() == "https" }
    let displayName = "Backend PropertyTwin"

    func generate(_ request: ImageGenerationRequest) async throws -> Data {
        guard isConfigured else { throw ImageGenerationError.invalidEndpoint }

        let payload = BackendRequest(
            imageBase64: request.sourceImageData.base64EncodedString(),
            action: request.action.rawValue,
            style: request.style,
            userPrompt: request.prompt,
            instruction: instruction(for: request),
            preserveGeometry: true
        )
        var urlRequest = URLRequest(url: endpoint)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        urlRequest.timeoutInterval = 120
        urlRequest.httpBody = try JSONEncoder().encode(payload)

        let (data, response) = try await session.data(for: urlRequest)
        guard let http = response as? HTTPURLResponse else {
            throw ImageGenerationError.invalidResponse
        }
        guard 200..<300 ~= http.statusCode else {
            let error = try? JSONDecoder().decode(BackendError.self, from: data)
            throw ImageGenerationError.server(error?.message ?? "Le backend IA a refusé la génération (\(http.statusCode)).")
        }

        if let result = try? JSONDecoder().decode(BackendResponse.self, from: data) {
            if let encoded = result.imageBase64,
               let imageData = Data(base64Encoded: encoded),
               !imageData.isEmpty {
                return imageData
            }
            if let urlString = result.imageURL,
               let url = URL(string: urlString),
               url.scheme?.lowercased() == "https" {
                let (imageData, imageResponse) = try await session.data(from: url)
                guard let imageHTTP = imageResponse as? HTTPURLResponse,
                      200..<300 ~= imageHTTP.statusCode,
                      !imageData.isEmpty else {
                    throw ImageGenerationError.invalidResponse
                }
                return imageData
            }
        }

        let mimeType = http.value(forHTTPHeaderField: "Content-Type") ?? ""
        if mimeType.hasPrefix("image/"), !data.isEmpty { return data }
        throw ImageGenerationError.invalidResponse
    }

    private func instruction(for request: ImageGenerationRequest) -> String {
        let base = "Edit the supplied real-estate photo photorealistically. Preserve camera perspective, room envelope, walls, floor boundaries, doors, windows, ceiling, openings, and all fixed architectural geometry. Do not change dimensions or invent additional space."
        switch request.action {
        case .furnish:
            return base + " Add coherent, correctly scaled furniture in a \(request.style) style. Keep circulation paths usable."
        case .empty:
            return base + " Remove only movable furniture and personal objects. Reconstruct only the actually visible architectural surfaces."
        case .renovate:
            return base + " Apply a realistic \(request.style) renovation while preserving the exact architecture."
        case .floor:
            return base + " Change only the floor finish to a coherent \(request.style) material."
        case .walls:
            return base + " Change only wall finishes and paint in a \(request.style) direction."
        case .style:
            return base + " Restyle movable decor and finishes in a \(request.style) direction."
        }
    }
}


/// Direct trial provider using Hugging Face Inference Providers.
/// Intended for evaluation credits only. The personal token is stored in the iOS Keychain.
struct HuggingFaceTrialImageProvider: ImageGenerationProvider {
    let token: String
    var session: URLSession = .shared

    let displayName = "Hugging Face · essai"
    var isConfigured: Bool { token.hasPrefix("hf_") && token.count > 10 }

    func generate(_ request: ImageGenerationRequest) async throws -> Data {
        guard isConfigured else { throw ImageGenerationError.notConfigured }
        guard let endpoint = URL(string: "https://router.huggingface.co/fal-ai/black-forest-labs/FLUX.1-Kontext-dev") else {
            throw ImageGenerationError.invalidEndpoint
        }

        let payload = HuggingFaceRequest(
            inputs: request.sourceImageData.base64EncodedString(),
            parameters: .init(
                prompt: Self.instruction(for: request),
                negativePrompt: "distorted architecture, changed windows, changed doors, extra room, warped walls, incorrect perspective, text, watermark",
                guidanceScale: 3.5,
                numInferenceSteps: 28
            )
        )
        var urlRequest = URLRequest(url: endpoint)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("image/*", forHTTPHeaderField: "Accept")
        urlRequest.timeoutInterval = 180
        urlRequest.httpBody = try JSONEncoder().encode(payload)

        let (data, response) = try await session.data(for: urlRequest)
        guard let http = response as? HTTPURLResponse else {
            throw ImageGenerationError.invalidResponse
        }
        guard 200..<300 ~= http.statusCode else {
            let apiError = try? JSONDecoder().decode(HuggingFaceError.self, from: data)
            let fallback = http.statusCode == 402
                ? "Crédits gratuits épuisés. Connectez le backend PropertyTwin pour continuer."
                : "Le fournisseur IA a refusé la génération (\(http.statusCode))."
            throw ImageGenerationError.server(apiError?.error ?? fallback)
        }
        guard (http.value(forHTTPHeaderField: "Content-Type") ?? "").hasPrefix("image/"),
              !data.isEmpty else {
            throw ImageGenerationError.invalidResponse
        }
        return data
    }

    static func instruction(for request: ImageGenerationRequest) -> String {
        let architecture = "Photorealistic real-estate image edit. Preserve exactly the source camera, perspective, room dimensions, walls, ceiling, floor boundaries, doors, windows and openings. Never add space or alter structural geometry."
        let change: String
        switch request.action {
        case .furnish: change = "Furnish the room with correctly scaled \(request.style) furniture and clear circulation."
        case .empty: change = "Remove movable furniture and personal objects only."
        case .renovate: change = "Create a realistic \(request.style) renovation without structural changes."
        case .floor: change = "Change only the floor finish in a \(request.style) direction."
        case .walls: change = "Change only wall paint and finishes in a \(request.style) direction."
        case .style: change = "Restyle movable decor and finishes in a \(request.style) direction."
        }
        return [architecture, change, request.prompt].filter { !$0.isEmpty }.joined(separator: " ")
    }
}

private struct HuggingFaceRequest: Encodable {
    struct Parameters: Encodable {
        let prompt: String
        let negativePrompt: String
        let guidanceScale: Double
        let numInferenceSteps: Int

        enum CodingKeys: String, CodingKey {
            case prompt
            case negativePrompt = "negative_prompt"
            case guidanceScale = "guidance_scale"
            case numInferenceSteps = "num_inference_steps"
        }
    }

    let inputs: String
    let parameters: Parameters
}

private struct HuggingFaceError: Decodable {
    let error: String?
}

struct ImageGenerationService: Sendable {
    let provider: any ImageGenerationProvider

    init(provider: any ImageGenerationProvider = UnconfiguredImageProvider()) {
        self.provider = provider
    }

    static var live: ImageGenerationService {
        let userValue = UserDefaults.standard.string(forKey: "aiBackendEndpoint")
        let bundleValue = Bundle.main.object(forInfoDictionaryKey: "PROPERTYTWIN_AI_ENDPOINT") as? String
        if let value = [userValue, bundleValue].compactMap({ $0 }).first(where: { !$0.isEmpty }),
           let url = URL(string: value) {
            return ImageGenerationService(provider: BackendImageProvider(endpoint: url))
        }
        if let token = SecureCredentialStore.read(account: "huggingFaceToken") {
            return ImageGenerationService(provider: HuggingFaceTrialImageProvider(token: token))
        }
        return ImageGenerationService()
    }

    var isConfigured: Bool { provider.isConfigured }
    var providerName: String { provider.displayName }

    func generate(_ request: ImageGenerationRequest) async throws -> Data {
        guard provider.isConfigured else { throw ImageGenerationError.notConfigured }
        return try await provider.generate(request)
    }
}

private struct BackendRequest: Encodable {
    let imageBase64: String
    let action: String
    let style: String
    let userPrompt: String
    let instruction: String
    let preserveGeometry: Bool

    enum CodingKeys: String, CodingKey {
        case imageBase64 = "image_base64"
        case action, style
        case userPrompt = "user_prompt"
        case instruction
        case preserveGeometry = "preserve_geometry"
    }
}

private struct BackendResponse: Decodable {
    let imageBase64: String?
    let imageURL: String?

    enum CodingKeys: String, CodingKey {
        case imageBase64 = "image_base64"
        case imageURL = "image_url"
    }
}

private struct BackendError: Decodable {
    let message: String
}
