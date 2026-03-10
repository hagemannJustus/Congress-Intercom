import Foundation
import Combine

class ProjectStore: ObservableObject {
    @Published var projects: [Project] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    func fetchProjects(for email: String) {
        isLoading = true
        errorMessage = nil
        
        // This is a strawberry GraphQL query to get all projects with their members
        let query = """
        query {
          projects {
            id
            title
            pictureUrl
            description
            members {
              id
              email
            }
          }
        }
        """
        
        let url = URL(string: "http://localhost:8000/graphql")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = ["query": query]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.isLoading = false
                
                if let error = error {
                    self.errorMessage = "Failed to load projects: \(error.localizedDescription)"
                    return
                }
                
                guard let data = data else {
                    self.errorMessage = "No data received from server."
                    return
                }
                
                do {
                    let decoder = JSONDecoder()
                    // Strawberry's default format turns snake_case into camelCase
                    // so picture_url becomes pictureUrl, which matches our Swift model.
                    let responseData = try decoder.decode(GraphQLResponse.self, from: data)
                    
                    // Filter projects to only include those where the member list contains this user's email
                    let userProjects = responseData.data.projects.filter { project in
                        project.members.contains { member in
                            member.email.lowercased() == email.lowercased()
                        }
                    }
                    
                    self.projects = userProjects
                } catch {
                    self.errorMessage = "Failed to decode project data."
                    print("Decoding error: \(error)")
                }
            }
        }.resume()
    }
}
