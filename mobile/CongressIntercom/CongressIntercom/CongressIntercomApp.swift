import SwiftUI

@main
struct CongressIntercomApp: App {
    @StateObject private var authManager = AuthManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
    }
    
    private func handleDeepLink(_ url: URL) {
        // Expected format: congressintercom://verify?token=XYZ
        guard url.scheme == "congressintercom",
              url.host == "verify" else { return }
        
        let components = URLComponents(url: url, resolvingAgainstBaseURL: true)
        let token = components?.queryItems?.first(where: { $0.name == "token" })?.value
        
        if let token = token {
            authManager.verifyToken(token)
        }
    }
}
