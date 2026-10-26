import Foundation
import Vision
import ImageIO

struct TextLine: Codable {
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}
struct Region: Codable { let x: Int; let y: Int; let width: Int; let height: Int; let enhance: Bool? }
struct RegionResult: Codable { let index: Int; let lines: [TextLine]; let joined: String? }
struct Output: Codable { let version: Int; let width: Int; let height: Int; let lines: [TextLine]; let regions: [RegionResult] }

func recognize(_ image: CGImage, anchors: Bool, reference: CGSize? = nil) throws -> [TextLine] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    request.customWords = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ", "III", "II"]
    request.minimumTextHeight = 0.003
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    var output: [TextLine] = []
    let tokenPattern = try NSRegularExpression(pattern: "周[一二三四五六日天]|[0-9]{1,2}[-/][0-9]{1,2}|第[ ]*[0-9]{1,2}[ ]*周")
    func line(_ text: String, _ box: CGRect, _ confidence: Float) -> TextLine? {
        let clipped = box.intersection(CGRect(x: 0,y: 0,width: 1,height: 1))
        guard !clipped.isNull, clipped.width > 0, clipped.height > 0 else { return nil }
        let width = Double(reference?.width ?? CGFloat(image.width)), height = Double(reference?.height ?? CGFloat(image.height))
        return TextLine(text: text, confidence: confidence, x: max(0,Double(clipped.minX) * width),
                 y: max(0,Double(1 - clipped.maxY) * height), width: Double(clipped.width) * width, height: Double(clipped.height) * height)
    }
    for observation in request.results ?? [] {
        guard let text = observation.topCandidates(1).first else { continue }
        let normalized = text.string.applyingTransform(StringTransform("Traditional-Simplified"), reverse: false) ?? text.string
        if let value = line(normalized, observation.boundingBox, text.confidence) { output.append(value) }
        if anchors {
            for match in tokenPattern.matches(in: text.string, range: NSRange(text.string.startIndex..., in: text.string)) {
                guard let range = Range(match.range, in: text.string), let box = try text.boundingBox(for: range) else { continue }
                let part = String(text.string[range])
                if part != text.string, let value = line(part, box.boundingBox, text.confidence) { output.append(value) }
            }
        }
    }
    return output
}

func prepare(_ image: CGImage, enhance: Bool) -> CGImage {
    guard let context = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
          bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return image }
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    if enhance, let pixels = context.data?.assumingMemoryBound(to: UInt8.self) {
        var light = 0, dark = 0
        for y in 3..<max(3,image.height - 3) { for x in 3..<max(3,image.width - 3) {
            let i = (y * image.width + x) * 4, rgb = [Int(pixels[i]),Int(pixels[i+1]),Int(pixels[i+2])]
            if rgb.min()! > 210 && rgb.max()! - rgb.min()! < 32 { light += 1 }
            if rgb.max()! < 90 { dark += 1 }
        }}
        for y in 0..<image.height { for x in 0..<image.width {
            let i = (y * image.width + x) * 4, rgb = [Int(pixels[i]),Int(pixels[i+1]),Int(pixels[i+2])]
            let inside = x > 2 && x < image.width - 3 && y > 2 && y < image.height - 3
            let ink = inside && (dark > light ? rgb.max()! < 130 : rgb.min()! > 205 && rgb.max()! - rgb.min()! < 45)
            let value: UInt8 = ink ? 0 : 255
            pixels[i] = value; pixels[i+1] = value; pixels[i+2] = value; pixels[i+3] = 255
        }}
    }
    guard let base = context.makeImage() else { return image }
    let scale = image.width < 80 ? 3 : 2
    guard let resized = CGContext(data: nil, width: image.width * scale, height: image.height * scale, bitsPerComponent: 8,
          bytesPerRow: image.width * scale * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return base }
    resized.interpolationQuality = .high
    resized.draw(base, in: CGRect(x: 0, y: 0, width: image.width * scale, height: image.height * scale))
    return resized.makeImage() ?? base
}

// Put wrapped text bands on one row so short fragments and Roman numerals retain context.
func unroll(_ image: CGImage) -> CGImage? {
    guard let context = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
          bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    guard let pixels = context.data?.assumingMemoryBound(to: UInt8.self) else { return nil }
    var bands: [CGRect] = [], start: Int? = nil, last = 0
    func finish(_ top: Int, _ bottom: Int) {
        guard bottom - top >= 12 else { return }
        var left = image.width, right = 0
        for y in top...bottom { for x in 2..<image.width-2 {
            if pixels[(y * image.width + x) * 4] < 100 { left = min(left,x); right = max(right,x) }
        }}
        if right > left { bands.append(CGRect(x: max(0,left-2), y: max(0,top-2), width: min(image.width-left+2,right-left+5), height: min(image.height-top+2,bottom-top+5))) }
    }
    for y in 0..<image.height {
        var ink = 0
        for x in 2..<image.width-2 { if pixels[(y * image.width + x) * 4] < 100 { ink += 1 } }
        if ink >= 3 { if start == nil { start = y }; last = y }
        else if let top = start, y-last > 8 { finish(top,last); start = nil }
    }
    if let top = start { finish(top,last) }
    guard !bands.isEmpty, bands.count <= 20 else { return nil }
    let width = Int(bands.reduce(16) { $0 + $1.width + 12 }), height = Int((bands.map { $0.height }.max() ?? 40) + 20)
    guard width <= 10000, let row = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
          bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    row.setFillColor(CGColor(gray: 1, alpha: 1)); row.fill(CGRect(x: 0,y: 0,width: width,height: height))
    var left: CGFloat = 8
    for band in bands {
        if let crop = image.cropping(to: band) { row.draw(crop, in: CGRect(x: left,y: (CGFloat(height)-band.height)/2,width: band.width,height: band.height)) }
        left += band.width + 12
    }
    return row.makeImage()
}

do {
    guard CommandLine.arguments.count >= 2,
          let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil), image.width * image.height <= 12_000_000 else { exit(2) }
    var regions: [Region] = []
    if CommandLine.arguments.count > 2 {
        regions = try JSONDecoder().decode([Region].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))
        guard regions.count <= 120 else { exit(2) }
    }
    let lines = regions.isEmpty ? try recognize(image, anchors: true) : []
    var results: [RegionResult] = []
    for (index, region) in regions.enumerated() {
        guard region.x >= 0, region.y >= 0, region.width > 0, region.height > 0,
              region.x + region.width <= image.width, region.y + region.height <= image.height,
              let crop = image.cropping(to: CGRect(x: region.x, y: region.y, width: region.width, height: region.height)) else { exit(2) }
        let prepared = prepare(crop, enhance: region.enhance ?? false)
        var joined: String? = nil
        if region.enhance == true, let row = unroll(prepared) {
            let recognized = try recognize(row, anchors: false)
            joined = recognized.sorted { $0.x < $1.x }.map { $0.text }.joined(separator: " ")
        }
        results.append(RegionResult(index: index, lines: try recognize(prepared, anchors: false, reference: CGSize(width: region.width, height: region.height)), joined: joined))
    }
    let data = try JSONEncoder().encode(Output(version: 1, width: image.width, height: image.height, lines: lines, regions: results))
    FileHandle.standardOutput.write(data)
} catch {
    // Recognition errors must not echo image text, paths or private contents.
    FileHandle.standardError.write(Data("LOCAL_OCR_FAILED\n".utf8))
    exit(3)
}
