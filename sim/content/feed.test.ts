import { describe, it, expect } from "vitest";
import { buildFeedRows } from "./feed";

const NOW = Date.parse("2026-07-27T12:00:00Z");
const base = {
  creatorIds: Array.from({ length: 300 }, (_, i) => `c-${i}`),
  orgIds: Array.from({ length: 50 }, (_, i) => `o-${i}`),
  workPaths: Array.from({ length: 100 }, (_, i) => `synthetic/work/${String(i).padStart(4, "0")}.jpg`),
  supabaseUrl: "https://x.supabase.co",
  count: 500,
  nowMs: NOW,
};

describe("buildFeedRows", () => {
  it("builds the requested number of rows", () => {
    expect(buildFeedRows(base)).toHaveLength(500);
  });

  it("is deterministic for the same input", () => {
    expect(buildFeedRows(base)).toEqual(buildFeedRows(base));
  });

  it("fills every NOT NULL column the table requires", () => {
    for (const r of buildFeedRows(base).slice(0, 20)) {
      expect(r.creator_id).toBeTruthy();
      expect(r.target_org_id).toBeTruthy();
      expect(r.content_type).toBe("photo");
      expect(r.content_file_path).toContain("/synthetic/work/");
    }
  });

  // Spec §4.4: a feed where everything posted at once reads as a dump, not as activity.
  it("ages submitted_at across the window, never in the future", () => {
    const rows = buildFeedRows(base);
    const times = rows.map((r) => Date.parse(r.submitted_at));
    expect(Math.max(...times)).toBeLessThanOrEqual(NOW);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(NOW - 61 * 24 * 3600 * 1000);
    expect(new Set(times).size).toBeGreaterThan(100); // genuinely spread, not 3 buckets
  });

  it("sets expires_at far beyond the 30-day column default so the feed cannot silently empty", () => {
    const r = buildFeedRows(base)[0];
    expect(Date.parse(r.expires_at)).toBeGreaterThan(NOW + 300 * 24 * 3600 * 1000);
  });

  // The landing-hero predicate is boosted + video + a paid boost row. These rows must fail it.
  it("emits no boost fields and only photo content", () => {
    for (const r of buildFeedRows(base)) {
      expect(r.content_type).toBe("photo");
      expect(r).not.toHaveProperty("boost_status");
      expect(r).not.toHaveProperty("post_url");
    }
  });

  it("spreads posts across creators instead of piling them on a few", () => {
    const perCreator = new Map<string, number>();
    for (const r of buildFeedRows(base)) perCreator.set(r.creator_id, (perCreator.get(r.creator_id) ?? 0) + 1);
    expect(perCreator.size).toBeGreaterThan(150);
    expect(Math.max(...perCreator.values())).toBeLessThan(8);
  });

  it("writes a non-empty caption and at least one hashtag", () => {
    for (const r of buildFeedRows(base).slice(0, 20)) {
      expect(r.caption.length).toBeGreaterThan(0);
      expect(r.hashtags.length).toBeGreaterThan(0);
    }
  });

  it("returns nothing when there is no pool or no creators", () => {
    expect(buildFeedRows({ ...base, workPaths: [] })).toEqual([]);
    expect(buildFeedRows({ ...base, creatorIds: [] })).toEqual([]);
    expect(buildFeedRows({ ...base, orgIds: [] })).toEqual([]);
  });
});
