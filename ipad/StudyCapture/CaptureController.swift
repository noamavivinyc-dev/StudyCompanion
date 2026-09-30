import AVFoundation
import CoreImage
import ScreenCaptureKit
import SwiftUI
import UIKit

final class CaptureController: NSObject, ObservableObject, @unchecked Sendable {
    @Published var macAddress: String {
        didSet { UserDefaults.standard.set(macAddress, forKey: "macAddress") }
    }
    @Published var pairingToken: String {
        didSet { UserDefaults.standard.set(pairingToken, forKey: "pairingToken") }
    }
    @Published private(set) var isSharing = false
    @Published private(set) var isSending = false
    @Published private(set) var framesSent = 0
    @Published var errorMessage: String?

    private let picker = SCContentSharingPicker.shared
    private let sampleQueue = DispatchQueue(label: "com.studycompanion.capture.samples", qos: .userInitiated)
    private let imageContext = CIContext(options: [.cacheIntermediates: false])
    private var stream: SCStream?
    private var lastSentAt = Date.distantPast
    private let sendInterval: TimeInterval = 1.0

    override init() {
        macAddress = UserDefaults.standard.string(forKey: "macAddress") ?? ""
        pairingToken = UserDefaults.standard.string(forKey: "pairingToken") ?? ""
        super.init()
        picker.add(self)
        picker.isActive = true
    }

    deinit {
        picker.remove(self)
    }

    var canStart: Bool {
        !macAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !pairingToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var statusTitle: String {
        if isSharing { return isSending ? "Sending notebook frames" : "Screen sharing is active" }
        return "Not sharing"
    }

    var statusDetail: String {
        if isSharing { return "You can switch to Notability and keep writing." }
        return "Your screen is private until you choose to share it."
    }

    var statusColor: Color {
        isSharing ? Color(red: 0.94, green: 0.35, blue: 0.18) : Color.gray.opacity(0.65)
    }

    func presentPicker() {
        guard canStart else {
            errorMessage = "Enter the Mac address and pairing code shown in Study Companion."
            return
        }
        guard picker.isAvailable else {
            errorMessage = "Screen sharing is not available on this iPad. Study Capture requires iPadOS 27 or newer."
            return
        }
        picker.isActive = true
        picker.present()
    }

    func stop() {
        guard let stream else {
            isSharing = false
            return
        }
        stream.stopCapture { [weak self] error in
            DispatchQueue.main.async {
                self?.stream = nil
                self?.isSharing = false
                self?.isSending = false
                if let error { self?.errorMessage = error.localizedDescription }
            }
        }
    }

    private func begin(filter: SCContentFilter) {
        stream?.stopCapture(completionHandler: nil)
        let configuration = SCStreamConfiguration()
        configuration.width = 1600
        configuration.height = 1200

        let newStream = SCStream(filter: filter, configuration: configuration, delegate: self)
        do {
            try newStream.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
            stream = newStream
            newStream.startCapture { [weak self] error in
                DispatchQueue.main.async {
                    if let error {
                        self?.errorMessage = error.localizedDescription
                        self?.stream = nil
                        self?.isSharing = false
                    } else {
                        self?.isSharing = true
                        self?.framesSent = 0
                    }
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func send(_ data: Data, width: Int, height: Int) {
        guard let url = receiverURL else {
            DispatchQueue.main.async { self.errorMessage = "The Mac address is not valid." }
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = data
        request.timeoutInterval = 8
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(pairingToken.trimmingCharacters(in: .whitespacesAndNewlines).uppercased())", forHTTPHeaderField: "Authorization")
        request.setValue(String(width), forHTTPHeaderField: "X-Frame-Width")
        request.setValue(String(height), forHTTPHeaderField: "X-Frame-Height")
        request.setValue("iPad", forHTTPHeaderField: "X-Frame-Source")
        DispatchQueue.main.async { self.isSending = true }
        URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode
            DispatchQueue.main.async {
                self?.isSending = false
                if let error {
                    self?.errorMessage = "Couldn’t reach the Mac: \(error.localizedDescription)"
                } else if status != 202 {
                    self?.errorMessage = status == 401 ? "The pairing code does not match the Mac." : "The Mac rejected the frame (status \(status ?? 0))."
                } else {
                    self?.framesSent += 1
                }
            }
        }.resume()
    }

    private var receiverURL: URL? {
        var raw = macAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        if !raw.contains("://") { raw = "http://\(raw)" }
        raw = raw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(raw)/v1/frame")
    }
}

extension CaptureController: SCContentSharingPickerObserver {
    func contentSharingPicker(_ picker: SCContentSharingPicker, didCancelFor stream: SCStream?) {}

    func contentSharingPicker(_ picker: SCContentSharingPicker, didUpdateWith filter: SCContentFilter, for stream: SCStream?) {
        begin(filter: filter)
    }

    func contentSharingPickerStartDidFailWithError(_ error: Error) {
        errorMessage = error.localizedDescription
    }
}

extension CaptureController: SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        DispatchQueue.main.async {
            self.stream = nil
            self.isSharing = false
            self.isSending = false
            self.errorMessage = error.localizedDescription
        }
    }
}

extension CaptureController: SCStreamOutput {
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard outputType == .screen, sampleBuffer.isValid, Date().timeIntervalSince(lastSentAt) >= sendInterval,
              let pixelBuffer = sampleBuffer.imageBuffer else { return }
        lastSentAt = Date()
        let image = CIImage(cvPixelBuffer: pixelBuffer)
        guard let cgImage = imageContext.createCGImage(image, from: image.extent),
              let data = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.72) else { return }
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        send(data, width: width, height: height)
    }
}
