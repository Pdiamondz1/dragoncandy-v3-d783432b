import { describe, it, expect } from "vitest";
import { allowedMediaPrefix, buildClips, type LandingClipRow } from "./lib";

// The real shape: `${SUPABASE_URL}/storage/v1/object/public/dragonshare-content/<uid>/<uuid>.<ext>`
const PREFIX = allowedMediaPrefix("https://zocahiffooqdybdhguqv.supabase.co");
const url = (name: string) => `${PREFIX}uid/${name}`;

const row = (over: Partial<LandingClipRow>): LandingClipRow => ({
  content_file_path: url("a.mp4"),
  screenshot_url: null,
  ...over,
});

const clips = (rows: LandingClipRow[], cap?: number) =>
  cap === undefined ? buildClips(rows, PREFIX) : buildClips(rows, PREFIX, cap);

describe("allowedMediaPrefix", () => {
  it("builds the public dragonshare-content prefix and tolerates a trailing slash", () => {
    const expected =
      "https://x.supabase.co/storage/v1/object/public/dragonshare-content/";
    expect(allowedMediaPrefix("https://x.supabase.co")).toBe(expected);
    expect(allowedMediaPrefix("https://x.supabase.co/")).toBe(expected);
  });
});

describe("buildClips", () => {
  it("maps a playable video row to { src } (no poster when screenshot_url is null)", () => {
    expect(clips([row({})])).toEqual([{ src: url("a.mp4") }]);
  });

  it("includes poster when screenshot_url is present", () => {
    expect(clips([row({ screenshot_url: url("a.jpg") })])).toEqual([
      { src: url("a.mp4"), poster: url("a.jpg") },
    ]);
  });

  it("drops rows with a null content_file_path", () => {
    expect(clips([row({ content_file_path: null })])).toEqual([]);
  });

  it("drops rows whose file is not a video extension (mislabeled image)", () => {
    expect(clips([row({ content_file_path: url("a.jpg") })])).toEqual([]);
  });

  it("accepts mp4/webm (case-insensitive) and REJECTS .mov/.MOV (HEVC / portrait risk)", () => {
    const rows = ["a.mp4", "b.WEBM", "c.mov", "d.MOV"].map((p) =>
      row({ content_file_path: url(p) }),
    );
    expect(clips(rows).map((c) => c.src)).toEqual([url("a.mp4"), url("b.WEBM")]);
  });

  it("de-dupes by src (a post joined to >1 boost row arrives duplicated)", () => {
    const dup = row({ content_file_path: url("a.mp4") });
    expect(clips([dup, dup])).toEqual([{ src: url("a.mp4") }]);
  });

  it("caps at 4 by default", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ content_file_path: url(`v${i}.mp4`) }),
    );
    expect(clips(rows)).toHaveLength(4);
  });

  it("preserves input order", () => {
    const rows = ["z.mp4", "a.mp4"].map((p) => row({ content_file_path: url(p) }));
    expect(clips(rows).map((c) => c.src.endsWith("z.mp4"))).toEqual([true, false]);
  });

  // --- Origin pinning. Both columns are creator-writable free text (ds_posts_creator_insert /
  // _update gate only on creator_id = auth.uid(); trg_ds_posts_block_self_verify lists neither),
  // and this response is served to anonymous homepage visitors.

  it("drops a clip whose src is off-bucket, even with a valid video extension", () => {
    expect(clips([row({ content_file_path: "https://evil.example.com/uid/a.mp4" })])).toEqual([]);
  });

  it("drops an off-bucket poster but KEEPS the clip (video plays, just no still frame)", () => {
    expect(clips([row({ screenshot_url: "https://evil.example.com/beacon.jpg" })])).toEqual([
      { src: url("a.mp4") },
    ]);
  });

  it("rejects a prefix-lookalike host (startsWith is anchored at the origin)", () => {
    const lookalike =
      "https://zocahiffooqdybdhguqv.supabase.co.evil.example.com/storage/v1/object/public/dragonshare-content/uid/a.mp4";
    expect(clips([row({ content_file_path: lookalike })])).toEqual([]);
  });

  it("rejects another public bucket on the same project", () => {
    const otherBucket =
      "https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/uid/a.mp4";
    expect(clips([row({ content_file_path: otherBucket })])).toEqual([]);
  });

  it("rejects a non-http scheme", () => {
    expect(clips([row({ content_file_path: "javascript:alert(1)//a.mp4" })])).toEqual([]);
  });
});
