// A six-second, silent synthetic fixture. No camera, microphone or user media.
import Foundation
import AVFoundation
import CoreGraphics
import ImageIO
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
guard !FileManager.default.fileExists(atPath: output.path),
      let source = CGImageSourceCreateWithURL(input as CFURL,nil),
      let image = CGImageSourceCreateImageAtIndex(source,0,nil) else { fatalError("Invalid fixture input or output already exists") }
let writer = try AVAssetWriter(outputURL:output,fileType:.mp4)
let video = AVAssetWriterInput(mediaType:.video,outputSettings:[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:1400,AVVideoHeightKey:700])
let adapter = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:video,sourcePixelBufferAttributes:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:1400,kCVPixelBufferHeightKey as String:700])
writer.add(video);writer.startWriting();writer.startSession(atSourceTime:.zero)
for index in 0..<12 {
    while !video.isReadyForMoreMediaData { Thread.sleep(forTimeInterval:0.01) }
    var buffer: CVPixelBuffer?
    CVPixelBufferCreate(kCFAllocatorDefault,1400,700,kCVPixelFormatType_32ARGB,nil,&buffer)
    guard let pixel=buffer else { fatalError("Pixel buffer unavailable") }
    CVPixelBufferLockBaseAddress(pixel,[])
    let ctx=CGContext(data:CVPixelBufferGetBaseAddress(pixel),width:1400,height:700,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(pixel),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!
    ctx.draw(image,in:CGRect(x:0,y:0,width:1400,height:700));CVPixelBufferUnlockBaseAddress(pixel,[])
    guard adapter.append(pixel,withPresentationTime:CMTime(value:Int64(index),timescale:2)) else { fatalError("Append failed") }
}
video.markAsFinished();let completion=DispatchSemaphore(value:0);writer.finishWriting { completion.signal() }
guard completion.wait(timeout:.now()+20) == .success, writer.status == .completed else { fatalError("Video fixture failed") }
print("Created silent synthetic MP4.")
