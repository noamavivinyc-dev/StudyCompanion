import SwiftUI

@main
struct StudyCaptureApp: App {
    @StateObject private var capture = CaptureController()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(capture)
        }
    }
}
