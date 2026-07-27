import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePng, renderMonogram, sniffImageType } from "./png";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("encodePng", () => {
  it("emits the PNG signature and an IHDR carrying the dimensions", () => {
    const png = Buffer.from(encodePng(2, 3, new Uint8Array(2 * 3 * 3)));
    expect(png.subarray(0, 8).equals(SIG)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(2); // IHDR width
    expect(png.readUInt32BE(20)).toBe(3); // IHDR height
  });

  it("round-trips pixel data through inflate with per-row filter bytes", () => {
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0]); // 2x1: red, green
    const png = Buffer.from(encodePng(2, 1, rgb));
    const idatStart = png.indexOf(Buffer.from("IDAT")) + 4;
    const idatLen = png.readUInt32BE(idatStart - 8);
    const raw = inflateSync(png.subarray(idatStart, idatStart + idatLen));
    expect(Array.from(raw)).toEqual([0, 255, 0, 0, 0, 255, 0]); // filter byte 0 + RGB
  });

  it("rejects a pixel buffer whose length disagrees with the dimensions", () => {
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow(/length/);
  });
});

// Regression for the Codex round-3 finding: the image model chooses its own output format, so a
// hardcoded .jpg + image/jpeg upload can label a PNG as a JPEG.
describe("sniffImageType", () => {
  it("identifies a PNG produced by our own encoder", () => {
    expect(sniffImageType(encodePng(1, 1, new Uint8Array(3)))).toEqual({ ext: "png", mime: "image/png" });
  });

  it("identifies JPEG from its SOI marker", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toEqual({
      ext: "jpg",
      mime: "image/jpeg",
    });
  });

  it("identifies WEBP from the RIFF....WEBP header", () => {
    const b = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
    expect(sniffImageType(new Uint8Array(b))).toEqual({ ext: "webp", mime: "image/webp" });
  });

  it("throws on unrecognised bytes rather than letting an unknown blob into the pool", () => {
    expect(() => sniffImageType(new Uint8Array([1, 2, 3, 4]))).toThrow(/unrecognised/);
  });
});

describe("renderMonogram", () => {
  const palette = { bg: [15, 118, 110] as [number, number, number], fg: [255, 255, 255] as [number, number, number] };

  it("produces a decodable square PNG of the requested size", () => {
    const png = Buffer.from(renderMonogram("JP", palette, 256));
    expect(png.subarray(0, 8).equals(SIG)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
  });

  it("is deterministic — same input, byte-identical output", () => {
    expect(Buffer.from(renderMonogram("JP", palette)).equals(Buffer.from(renderMonogram("JP", palette)))).toBe(true);
  });

  it("actually draws the glyphs — different text gives different bytes", () => {
    expect(Buffer.from(renderMonogram("JP", palette)).equals(Buffer.from(renderMonogram("ZZ", palette)))).toBe(false);
  });

  it("renders an unmapped character as the fallback instead of throwing", () => {
    expect(() => renderMonogram("☃X", palette, 64)).not.toThrow();
  });
});
