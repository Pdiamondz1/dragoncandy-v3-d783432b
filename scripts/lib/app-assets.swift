// Pixel work for `npm run cap:assets`. Swift/CoreGraphics rather than Node because
// compositing two images needs an image library, and the alternatives all cost a
// dependency: `sips` (macOS built-in) can crop and scale but cannot composite, and
// sharp/@capacitor/assets would add one. iOS assets can only be built on macOS
// anyway, so a macOS-only tool costs nothing here.
//
// Policy lives in scripts/build-app-assets.mjs. This file only does pixels:
// it composes, and it reports what is actually in a PNG. It never decides
// whether a value is acceptable.
//
//   app-assets.swift icon   <src>  <out> <RRGGBB> <size>
//   app-assets.swift splash <logo> <out> <RRGGBB> <canvas> <logoWidth>
//   app-assets.swift probe  <png>  [x y w h]        -> JSON on stdout

import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func fail(_ m: String) -> Never {
    FileHandle.standardError.write("app-assets: \(m)\n".data(using: .utf8)!)
    exit(1)
}

func load(_ path: String) -> CGImage {
    guard let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(s, 0, nil) else { fail("cannot read \(path)") }
    return img
}

func parseHex(_ hex: String) -> (CGFloat, CGFloat, CGFloat) {
    guard hex.count == 6, let v = Int(hex, radix: 16) else { fail("bad hex \(hex)") }
    return (CGFloat((v >> 16) & 0xFF) / 255, CGFloat((v >> 8) & 0xFF) / 255, CGFloat(v & 0xFF) / 255)
}

/// Always writes an OPAQUE png: `noneSkipLast` makes the encoder emit RGB, not RGBA.
/// The app icon must have no alpha channel or App Store submission is rejected, and
/// there is no reason for the splash to carry one either.
func newOpaqueContext(_ size: Int, _ hex: String) -> CGContext {
    guard let ctx = CGContext(data: nil, width: size, height: size,
                              bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { fail("cannot create \(size)x\(size) context") }
    let (r, g, b) = parseHex(hex)
    ctx.interpolationQuality = .high
    ctx.setFillColor(red: r, green: g, blue: b, alpha: 1)
    ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
    return ctx
}

func write(_ ctx: CGContext, to path: String) {
    guard let img = ctx.makeImage(),
          let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL,
                                                     UTType.png.identifier as CFString, 1, nil)
    else { fail("cannot encode \(path)") }
    CGImageDestinationAddImage(dest, img, nil)
    guard CGImageDestinationFinalize(dest) else { fail("cannot write \(path)") }
}

// MARK: - pixel readback

/// CoreGraphics has no unpremultiplied 8bpc RGBA context, so RGB is premultiplied.
/// Exact for the opaque images we judge colour on; for a transparent source only the
/// alpha channel is meaningful.
func readPixels(_ img: CGImage) -> ([UInt8], Int, Int) {
    let w = img.width, h = img.height
    var buf = [UInt8](repeating: 0, count: w * h * 4)
    buf.withUnsafeMutableBytes { raw in
        let ctx = CGContext(data: raw.baseAddress, width: w, height: h,
                            bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    }
    return (buf, w, h)
}

func srgbLuminance(_ r: Int, _ g: Int, _ b: Int) -> Double {
    func c(_ v: Int) -> Double {
        let s = Double(v) / 255
        return s <= 0.04045 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

// MARK: - commands

let a = CommandLine.arguments
guard a.count >= 3 else { fail("usage: app-assets.swift <icon|splash|probe> ...") }

switch a[1] {

case "icon":
    guard a.count == 6 else { fail("usage: icon <src> <out> <RRGGBB> <size>") }
    let src = load(a[2]), size = Int(a[5])!
    let ctx = newOpaqueContext(size, a[4])
    // The transparent source shares the icon's composition exactly (same fractional
    // insets), so filling the canvas edge-to-edge preserves the on-device framing.
    // The dragon's eye and nostril are HOLES in the alpha channel, which is why they
    // simply take the background colour instead of needing to be repainted.
    ctx.draw(src, in: CGRect(x: 0, y: 0, width: size, height: size))
    write(ctx, to: a[3])

case "splash":
    guard a.count == 7 else { fail("usage: splash <logo> <out> <RRGGBB> <canvas> <logoWidth>") }
    let logo = load(a[2]), canvas = Int(a[5])!, lw = Double(a[6])!
    // Derive height from the asset's real aspect. Hardcoding it is how a logo ends up
    // stretched when the source is replaced -- the same trap docs/DESIGN_SYSTEM.md
    // records for the web headers' width/height attributes.
    let lh = (lw * Double(logo.height) / Double(logo.width)).rounded()
    let ctx = newOpaqueContext(canvas, a[4])
    ctx.draw(logo, in: CGRect(x: ((Double(canvas) - lw) / 2).rounded(),
                              y: ((Double(canvas) - lh) / 2).rounded(),
                              width: lw, height: lh))
    write(ctx, to: a[3])

case "probe":
    let img = load(a[2])
    let (px, w, h) = readPixels(img)
    let alpha = img.alphaInfo
    let hasAlpha = !(alpha == .none || alpha == .noneSkipLast || alpha == .noneSkipFirst)

    func at(_ x: Int, _ yTop: Int) -> (Int, Int, Int, Int) {
        let i = ((h - 1 - yTop) * w + x) * 4
        return (Int(px[i]), Int(px[i+1]), Int(px[i+2]), Int(px[i+3]))
    }
    func hex(_ p: (Int, Int, Int, Int)) -> String { String(format: "#%02X%02X%02X", p.0, p.1, p.2) }

    let corner = at(2, 2)

    // Bounding box of everything that differs from the corner colour.
    var minX = w, minY = h, maxX = -1, maxY = -1
    for y in 0..<h { for x in 0..<w {
        let p = at(x, y)
        let d = abs(p.0 - corner.0) + abs(p.1 - corner.1) + abs(p.2 - corner.2)
        if d > 40 || p.3 != corner.3 {
            if x < minX { minX = x }; if x > maxX { maxX = x }
            if y < minY { minY = y }; if y > maxY { maxY = y }
        }
    } }

    // Optional rect: count near-black OPAQUE pixels inside it.
    var darkCount = -1
    var darkest = "null"
    if a.count == 7 {
        let rx = Int(a[3])!, ry = Int(a[4])!, rw = Int(a[5])!, rh = Int(a[6])!
        var n = 0, lo = 2.0, loP = (0, 0, 0, 0)
        for y in ry..<min(ry + rh, h) { for x in rx..<min(rx + rw, w) {
            let p = at(x, y)
            guard p.3 > 200 else { continue }
            let l = srgbLuminance(p.0, p.1, p.2)
            if l < 0.10 { n += 1 }
            if l < lo { lo = l; loP = p }
        } }
        darkCount = n
        darkest = "\"\(hex(loP))\""
    }

    let bbox = maxX < 0 ? "null"
        : "{\"x\":\(minX),\"y\":\(h - 1 - maxY),\"w\":\(maxX - minX + 1),\"h\":\(maxY - minY + 1)}"
    print("""
    {"width":\(w),"height":\(h),"hasAlpha":\(hasAlpha),"corner":"\(hex(corner))",\
    "bbox":\(bbox),"darkPixels":\(darkCount),"darkest":\(darkest)}
    """)

default:
    fail("unknown command \(a[1])")
}
