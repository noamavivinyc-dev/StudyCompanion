import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var capture: CaptureController
    @FocusState private var focusedField: Field?

    private enum Field { case address, token }

    var body: some View {
        ZStack {
            Color(red: 0.957, green: 0.941, blue: 0.902).ignoresSafeArea()
            GeometryReader { proxy in
                Path { path in
                    stride(from: 0.0, through: proxy.size.width, by: 28).forEach { x in
                        path.move(to: CGPoint(x: x, y: 0)); path.addLine(to: CGPoint(x: x, y: proxy.size.height))
                    }
                    stride(from: 0.0, through: proxy.size.height, by: 28).forEach { y in
                        path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: proxy.size.width, y: y))
                    }
                }
                .stroke(Color(red: 0.086, green: 0.541, blue: 0.678).opacity(0.07), lineWidth: 1)
            }
            .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 28) {
                    header
                    connectionCard
                    statusCard
                    privacyNote
                }
                .frame(maxWidth: 620)
                .padding(.horizontal, 30)
                .padding(.vertical, 38)
                .frame(maxWidth: .infinity)
            }
        }
        .fontDesign(.rounded)
        .onTapGesture { focusedField = nil }
        .alert("Study Capture", isPresented: Binding(get: { capture.errorMessage != nil }, set: { if !$0 { capture.errorMessage = nil } })) {
            Button("OK", role: .cancel) { capture.errorMessage = nil }
        } message: {
            Text(capture.errorMessage ?? "")
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 17) {
            ZStack {
                Circle().stroke(Color.primary, lineWidth: 1.5).frame(width: 52, height: 52)
                Text("SC").font(.system(size: 13, weight: .bold, design: .rounded)).tracking(1)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Study Capture").font(.system(size: 34, weight: .medium, design: .serif))
                Text("YOUR NOTEBOOK, LIVE ON YOUR MAC").font(.caption2.weight(.bold)).tracking(1.5).foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private var connectionCard: some View {
        VStack(alignment: .leading, spacing: 20) {
            Label("Connect to your Mac", systemImage: "laptopcomputer.and.ipad")
                .font(.headline)
            VStack(alignment: .leading, spacing: 7) {
                fieldLabel("MAC ADDRESS")
                TextField("192.168.1.20:43129", text: $capture.macAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .focused($focusedField, equals: .address)
                    .fieldStyle()
            }
            VStack(alignment: .leading, spacing: 7) {
                fieldLabel("PAIRING CODE")
                TextField("Shown in the Mac app", text: $capture.pairingToken)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .token)
                    .fieldStyle(monospaced: true)
            }
            Button(action: primaryAction) {
                HStack {
                    Image(systemName: capture.isSharing ? "stop.fill" : "rectangle.inset.filled.and.person.filled")
                    Text(capture.isSharing ? "Stop sharing" : "Choose screen to share")
                    Spacer()
                    Image(systemName: "arrow.up.right")
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 17)
                .frame(height: 52)
                .background(capture.isSharing ? Color(red: 0.78, green: 0.22, blue: 0.12) : Color(red: 0.12, green: 0.15, blue: 0.16))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .disabled(!capture.canStart && !capture.isSharing)
            .opacity((capture.canStart || capture.isSharing) ? 1 : 0.45)
        }
        .padding(24)
        .background(Color.white.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.12)))
        .shadow(color: .black.opacity(0.07), radius: 24, y: 12)
    }

    private var statusCard: some View {
        HStack(spacing: 13) {
            Circle()
                .fill(capture.statusColor)
                .frame(width: 10, height: 10)
                .shadow(color: capture.statusColor.opacity(0.4), radius: 5)
            VStack(alignment: .leading, spacing: 2) {
                Text(capture.statusTitle).font(.subheadline.weight(.semibold))
                Text(capture.statusDetail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if capture.isSharing {
                Text("\(capture.framesSent) FRAMES").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 19)
        .frame(height: 66)
        .background(Color.white.opacity(0.48))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var privacyNote: some View {
        Label {
            Text("Frames go directly to your Mac over your local network. The app sends roughly one frame per second and stores nothing on the iPad.")
        } icon: {
            Image(systemName: "lock.shield")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 8)
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text).font(.caption2.weight(.bold)).tracking(1.2).foregroundStyle(.secondary)
    }

    private func primaryAction() {
        focusedField = nil
        if capture.isSharing { capture.stop() } else { capture.presentPicker() }
    }
}

private extension View {
    func fieldStyle(monospaced: Bool = false) -> some View {
        self
            .font(monospaced ? .system(.body, design: .monospaced) : .body)
            .padding(.horizontal, 13)
            .frame(height: 48)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 7))
            .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color.primary.opacity(0.14)))
    }
}
