import Foundation
import Vision

guard CommandLine.arguments.count == 2 else { fatalError("Provide one local image") }
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]
let handler = VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1]))
try handler.perform([request])
for observation in request.results ?? [] {
    if let payload = observation.payloadStringValue { print(payload) }
}
