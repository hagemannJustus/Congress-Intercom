import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var email: String = ""
    
    var body: some View {
        VStack(spacing: 30) {
            Spacer()
            
            // App Logo or Icon
            Image(systemName: "envelope.circle.fill")
                .resizable()
                .scaledToFit()
                .frame(width: 100, height: 100)
                .foregroundColor(.blue)
            
            VStack(spacing: 10) {
                Text("Welcome Back")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("Enter your email to receive a magic link")
                    .foregroundColor(.secondary)
            }
            
            VStack(alignment: .leading, spacing: 8) {
                Text("Email Address")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.gray)
                
                TextField("name@example.com", text: $email)
                    #if os(iOS)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    #endif
                    .padding()
                    .background(backgroundColor)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                    )
            }
            .padding(.horizontal)
            
            if let error = authManager.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.caption)
            }
            
            if let success = authManager.successMessage {
                Text(success)
                    .foregroundColor(.green)
                    .font(.caption)
            }
            
            Button(action: {
                authManager.requestMagicLink(email: email)
            }) {
                HStack {
                    if authManager.isSendingLink {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .padding(.trailing, 8)
                    }
                    Text("Log In")
                        .fontWeight(.bold)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(email.isEmpty ? Color.blue.opacity(0.5) : Color.blue)
                .foregroundColor(.white)
                .cornerRadius(12)
                .shadow(color: Color.blue.opacity(0.3), radius: 10, x: 0, y: 5)
            }
            .disabled(email.isEmpty || authManager.isSendingLink)
            .padding(.horizontal)
            
            Spacer()
            
            Text("By continuing, you agree to our Terms and Privacy Policy")
                .font(.caption2)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .padding()
        .background(pageBackground)
    }
    
    // Cross-platform helper for colors
    private var backgroundColor: Color {
        #if os(iOS)
        return Color(UIColor.systemGray6)
        #else
        return Color.gray.opacity(0.1)
        #endif
    }
    
    private var pageBackground: Color {
        #if os(iOS)
        return Color(UIColor.systemBackground)
        #else
        return Color.white
        #endif
    }
}

struct LoginView_Previews: PreviewProvider {
    static var previews: some View {
        LoginView()
            .environmentObject(AuthManager())
    }
}
