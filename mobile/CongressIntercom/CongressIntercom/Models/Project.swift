import Foundation

struct GraphQLResponse: Codable {
    let data: ProjectData
}

struct ProjectData: Codable {
    let projects: [Project]
}

struct Project: Codable, Identifiable {
    let id: Int
    let title: String
    let pictureUrl: String
    let description: String
    let members: [ProjectMember]
}

struct ProjectMember: Codable, Identifiable {
    let id: Int
    let email: String
}
