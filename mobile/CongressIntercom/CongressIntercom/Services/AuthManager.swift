import Foundation
import Combine

class AuthManager: ObservableObject {
    @Published var isAuthenticated = false
    @Published var isSendingLink = false
    @Published var errorMessage: String?
    @Published var successMessage: String?
    @Published var userEmail: String?
    
    // Replace with your actual backend URL
    private let backendURL = URL(string: "http://localhost:8000/graphql")!
    
    func requestMagicLink(email: String) {
        isSendingLink = true
        errorMessage = nil
        successMessage = nil
        
        let mutation = """
        mutation {
          requestMagicLink(email: "\(email)") {
            success
            message
          }
        }
        """
        
        let body: [String: Any] = ["query": mutation]
        var request = URLRequest(url: backendURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.isSendingLink = false
                
                if let error = error {
                    self.errorMessage = "Network error: \(error.localizedDescription)"
                    return
                }
                
                guard let data = data else {
                    self.errorMessage = "No data received"
                    return
                }
                
                do {
                    if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let dataDict = json["data"] as? [String: Any],
                       let responseDict = dataDict["requestMagicLink"] as? [String: Any] {
                        
                        let success = responseDict["success"] as? Bool ?? false
                        let message = responseDict["message"] as? String ?? ""
                        
                        if success {
                            self.successMessage = "Check your email for the magic link!"
                        } else {
                            self.errorMessage = message
                        }
                    }
                } catch {
                    self.errorMessage = "Failed to parse response"
                }
            }
        }.resume()
    }
    
    func verifyToken(_ token: String) {
        // In a real app, you might want to call the backend to exchange the token for a session/JWT
        // For this demo, we'll just set isAuthenticated to true if we received a token
        DispatchQueue.main.async {
            self.isAuthenticated = true
            self.successMessage = "Logged in successfully!"
        }
    }
    
    func logout() {
        self.isAuthenticated = false
        self.userEmail = nil
    }
}
