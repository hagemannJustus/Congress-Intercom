// swift-tools-version:5.6
import PackageDescription

let package = Package(
    name: "CongressIntercom",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .executable(name: "CongressIntercom", targets: ["CongressIntercom"])
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "CongressIntercom",
            dependencies: [],
            path: "CongressIntercom"
        )
    ]
)
