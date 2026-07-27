import { describe, it, expect } from "vitest";
import { buildFeedRows } from "./feed";

// The public landing hero (supabase/functions/landing-clips) selects:
//
//   .eq("status", "verified")
//   .eq("boost_status", "boosted")
//   .in("content_type", ["video", "reel"])
//   .in("dragonshare_boosts.status", ["captured", "transferred"])   // inner join
//
// Seeded rows must fail that predicate, so synthetic media can never appear on the marketing site.
// If someone later makes these rows boosted or video, THIS TEST FAILS instead of the change
// shipping quietly. See the spec §4.4.
const LANDING_CONTENT_TYPES = ["video", "reel"];

const rows = buildFeedRows({
  creatorIds: ["c-1", "c-2"],
  orgIds: ["o-1"],
  workPaths: ["synthetic/work/0000.jpg"],
  supabaseUrl: "https://x.supabase.co",
  count: 25,
  nowMs: Date.parse("2026-07-27T12:00:00Z"),
});

describe("landing-hero exclusion", () => {
  it("emits no content_type the landing query could select", () => {
    for (const r of rows) expect(LANDING_CONTENT_TYPES).not.toContain(r.content_type);
  });

  it("never sets boost_status, so the column keeps its 'available' default", () => {
    for (const r of rows) expect(r).not.toHaveProperty("boost_status");
  });

  it("emits no boost rows — the inner join can never match", () => {
    for (const r of rows) expect(r).not.toHaveProperty("boosts");
  });

  it("sets no post_url, so nothing reads as an off-platform published post", () => {
    for (const r of rows) expect(r).not.toHaveProperty("post_url");
  });
});
