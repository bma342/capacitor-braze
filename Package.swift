// swift-tools-version: 5.9
import PackageDescription

// Swift Package Manager manifest for the iOS bridge.
//
// Capacitor 8's CLI generates SPM-based iOS projects by default
// (`npx cap add ios`), so a CocoaPods-only plugin does not install into a
// stock Capacitor 8 app. CocoaPods remains fully supported through
// `CapacitorBraze.podspec` — the two manifests describe the same sources and
// the same exact Braze pins, and `demo/ios` (Pods) + `example/ios` (SPM) each
// build one of them in CI.
//
// Notes for maintainers:
//
//   * `capacitor-swift-pm` is Ionic's SPM distribution of the Capacitor iOS
//     runtime. It is tagged in lockstep with `@capacitor/core`, so the range
//     below spans exactly the majors the package.json peer dep allows
//     (6.0.0 ..< 9.0.0). Do not use `from:` — that would silently absorb
//     Capacitor 9.
//   * The Braze dependency is `.exact("18.2.1")`, matching the podspec. C08
//     forbids range pins on native SDKs, and SPM is not an exception.
//   * `PrivacyInfo.xcprivacy` is shipped as a target resource so the SPM build
//     reproduces what the podspec's `resource_bundles` gives the Pods build.
//   * There is no `.testTarget` here. `ios/Tests/BrazePluginTests` is an
//     XCTest bundle hosted by the demo app (see C11 and
//     `scripts/ios-add-test-target.rb`); it links the Pods-built plugin and
//     needs a running host app, which `swift test` cannot provide.
let package = Package(
    name: "CapacitorBraze",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapacitorBraze",
            targets: ["BrazePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", "6.0.0"..<"9.0.0"),
        .package(url: "https://github.com/braze-inc/braze-swift-sdk.git", exact: "18.2.1")
    ],
    targets: [
        .target(
            name: "BrazePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "BrazeKit", package: "braze-swift-sdk"),
                .product(name: "BrazeUI", package: "braze-swift-sdk")
            ],
            path: "ios/Sources/BrazePlugin",
            resources: [.copy("PrivacyInfo.xcprivacy")])
    ]
)
