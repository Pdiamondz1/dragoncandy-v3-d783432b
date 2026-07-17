import { describe, it, expect } from "vitest";
import { buildClips, type LandingClipRow } from "./lib";

const row = (over: Partial<LandingClipRow>): LandingClipRow => ({
  content_file_path: "https://cdn.example.com/uid/a.mp4",
  screenshot_url: null,
  ...over,
});

describe("buildClips", () => {
  it("maps a playable video row to { src } (no poster when screenshot_url is null)", () => {
    expect(buildClips([row({})])).toEqual([{ src: "https://cdn.example.com/uid/a.mp4" }]);
  });

  it("includes poster when screenshot_url is present", () => {
    expect(buildClips([row({ screenshot_url: "https://cdn.example.com/uid/a.jpg" })])).toEqual([
      { src: "https://cdn.example.com/uid/a.mp4", poster: "https://cdn.example.com/uid/a.jpg" },
    ]);
  });

  it("drops rows with a null content_file_path", () => {
    expect(buildClips([row({ content_file_path: null })])).toEqual([]);
  });

  it("drops rows whose file is not a video extension (mislabeled image)", () => {
    expect(buildClips([row({ content_file_path: "https://cdn.example.com/uid/a.jpg" })])).toEqual([]);
  });

  it("accepts mp4/webm/mov, case-insensitive", () => {
    const rows = ["a.mp4", "b.WEBM", "c.mov"].map((p) =>
      row({ content_file_path: `https://cdn.example.com/uid/${p}` }),
    );
    expect(buildClips(rows).map((c) => c.src)).toEqual([
      "https://cdn.example.com/uid/a.mp4",
      "https://cdn.example.com/uid/b.WEBM",
      "https://cdn.example.com/uid/c.mov",
    ]);
  });

  it("de-dupes by src (a post joined to >1 boost row arrives duplicated)", () => {
    const dup = row({ content_file_path: "https://cdn.example.com/uid/a.mp4" });
    expect(buildClips([dup, dup])).toEqual([{ src: "https://cdn.example.com/uid/a.mp4" }]);
  });

  it("caps at 4 by default", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ content_file_path: `https://cdn.example.com/uid/v${i}.mp4` }),
    );
    expect(buildClips(rows)).toHaveLength(4);
  });

  it("preserves input order", () => {
    const rows = ["z.mp4", "a.mp4"].map((p) => row({ content_file_path: `https://cdn.example.com/uid/${p}` }));
    expect(buildClips(rows).map((c) => c.src.endsWith("z.mp4"))).toEqual([true, false]);
  });
});
