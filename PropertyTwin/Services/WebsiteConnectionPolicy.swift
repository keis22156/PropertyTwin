import Foundation

/// Production uses HTTPS. Xcode Debug builds can also reach the Mac on its LAN.
enum WebsiteConnectionPolicy {
    static func accepts(_ origin: URL) -> Bool {
        guard let host = origin.host?.lowercased(), !host.isEmpty,
              origin.user == nil, origin.password == nil, origin.query == nil, origin.fragment == nil,
              origin.path.isEmpty || origin.path == "/" else { return false }
        if origin.scheme == "https" { return true }
        #if DEBUG
        guard origin.scheme == "http" else { return false }
        if host == "localhost" || host == "[::1]" || host.hasSuffix(".local") { return true }
        let bytes = host.split(separator: ".").compactMap { UInt8($0) }
        guard bytes.count == 4, host.split(separator: ".").count == 4 else { return false }
        return bytes[0] == 10 || bytes[0] == 127 || (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 172 && (16...31).contains(bytes[1]))
        #else
        return false
        #endif
    }

    static func canonical(_ origin: URL) -> String {
        var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
        components.path = ""
        if (origin.scheme == "https" && components.port == 443) || (origin.scheme == "http" && components.port == 80) { components.port = nil }
        return components.string!
    }
}
