import { describe, it, expect } from "vitest";
import {
  pickHandle, daysBetween,
  computeStalledCampaigns, computeDormantCreators, computeLapsedRestaurants,
  buildReactivationTargets, TARGET_CAP,
} from "./reactivation";

const NOW = "2026-06-27T00:00:00.000Z";
const ago = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

describe("pickHandle", () => {
  it("prefers instagram, falls back in order, null when none", () => {
    expect(pickHandle({ instagram_url: "ig", tiktok_url: "tt" })).toEqual({ channel: "instagram", handle: "ig" });
    expect(pickHandle({ tiktok_url: "tt", youtube_url: "yt" })).toEqual({ channel: "tiktok", handle: "tt" });
    expect(pickHandle({ website_url: "w" })).toEqual({ channel: "website", handle: "w" });
    expect(pickHandle({})).toBeNull();
  });
});

describe("computeStalledCampaigns", () => {
  const biz = { "u-biz": { user_id: "u-biz", business_name: "Joe's", instagram_url: "joeig" } };
  const crt = { "u-crt": { user_id: "u-crt", creator_name: "Mia", tiktok_url: "miatt", created_at: ago(40) } };

  it("flags a >14d published campaign with no collaboration (no-creator blocker)", () => {
    const out = computeStalledCampaigns({
      campaigns: [{ id: "c1", title: "Tacos", user_id: "u-biz", created_at: ago(20), updated_at: ago(20) }],
      collaborations: [], businessByUserId: biz, creatorByUserId: crt, nowIso: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0].blocker).toMatch(/no creator/i);
    expect(out[0].business_handle).toEqual({ channel: "instagram", handle: "joeig" });
    expect(out[0].creator_name).toBeNull();
    expect(out[0].days_stalled).toBe(20);
  });

  it("flags an unfinished collaboration and attaches the creator", () => {
    const out = computeStalledCampaigns({
      campaigns: [{ id: "c1", title: "Tacos", user_id: "u-biz", created_at: ago(30), updated_at: ago(30) }],
      collaborations: [{ campaign_id: "c1", creator_id: "u-crt", status: "active", content_status: "in_progress", updated_at: ago(20), completed_at: null }],
      businessByUserId: biz, creatorByUserId: crt, nowIso: NOW,
    });
    expect(out[0].blocker).toMatch(/finish/i);
    expect(out[0].creator_name).toBe("Mia");
    expect(out[0].creator_handle).toEqual({ channel: "tiktok", handle: "miatt" });
  });

  it("excludes campaigns with a completed collaboration and those <14d old", () => {
    const completed = computeStalledCampaigns({
      campaigns: [{ id: "c1", title: "X", user_id: "u-biz", created_at: ago(30), updated_at: ago(30) }],
      collaborations: [{ campaign_id: "c1", creator_id: "u-crt", status: "completed", content_status: "delivered", updated_at: ago(5), completed_at: ago(5) }],
      businessByUserId: biz, creatorByUserId: crt, nowIso: NOW,
    });
    expect(completed).toHaveLength(0);
    const fresh = computeStalledCampaigns({
      campaigns: [{ id: "c2", title: "Y", user_id: "u-biz", created_at: ago(3), updated_at: ago(3) }],
      collaborations: [], businessByUserId: biz, creatorByUserId: crt, nowIso: NOW,
    });
    expect(fresh).toHaveLength(0);
  });

  it("stays stalled by campaign age even after a recent edit (updated_at is not used)", () => {
    const out = computeStalledCampaigns({
      campaigns: [{ id: "c1", title: "Stuck but edited", user_id: "u-biz", created_at: ago(40), updated_at: ago(1) }],
      collaborations: [], businessByUserId: biz, creatorByUserId: crt, nowIso: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0].days_stalled).toBe(40);
  });
});

describe("computeDormantCreators", () => {
  const creators = [
    { user_id: "a", creator_name: "Ana", instagram_url: "anaig", created_at: ago(60), skills: ["food"] }, // never active, old → dormant
    { user_id: "b", creator_name: "Ben", created_at: ago(60) },   // active 2d ago → not dormant
    { user_id: "c", creator_name: "Cy", created_at: ago(3) },     // never active, 3d old → too new
    { user_id: "d", creator_name: "Dee", created_at: ago(10) },   // never active, 10d old → still < 21d, too new
    { user_id: "e", creator_name: "Eve", created_at: ago(60) },   // active 25d ago → dormant
  ];
  it("flags creators inactive >= 21d; a never-active creator only once the account itself is that old", () => {
    const out = computeDormantCreators({
      creators, lastActivityByUserId: { b: ago(2), e: ago(25) }, nowIso: NOW,
    });
    expect(out.map((c) => c.creator_name).sort()).toEqual(["Ana", "Eve"]);
    const ana = out.find((c) => c.creator_name === "Ana")!;
    expect(ana.days_since_activity).toBeNull();
    expect(ana.handle).toEqual({ channel: "instagram", handle: "anaig" });
    expect(out.find((c) => c.creator_name === "Eve")!.days_since_activity).toBe(25);
  });
});

describe("computeLapsedRestaurants", () => {
  const restaurants = [
    { user_id: "r1", business_name: "R1", instagram_url: "r1ig", created_at: ago(30) },
    { user_id: "r2", business_name: "R2", created_at: ago(30) },
    { user_id: "r3", business_name: "R3", created_at: ago(3) },
  ];
  it("flags >7d restaurants missing a campaign or a boost, with a reason", () => {
    const out = computeLapsedRestaurants({
      restaurants, campaignOwnerIds: ["r2"], boosterIds: ["r2"], nowIso: NOW,
    });
    expect(out.map((r) => r.business_name)).toEqual(["R1"]);
    expect(out[0].reason).toMatch(/never/i);
  });
});

describe("buildReactivationTargets caps each segment at TARGET_CAP and reports totals", () => {
  it("caps items but reports the true total", () => {
    const many = Array.from({ length: TARGET_CAP + 5 }, (_, i) => ({
      user_id: `u${i}`, creator_name: `C${i}`, created_at: ago(60),
    }));
    const res = buildReactivationTargets({
      nowIso: NOW, campaigns: [], collaborations: [], businessByUserId: {}, creatorByUserId: {},
      creators: many, lastActivityByUserId: {}, restaurants: [], campaignOwnerIds: [], boosterIds: [],
    });
    expect(res.dormant_creators.items).toHaveLength(TARGET_CAP);
    expect(res.dormant_creators.total).toBe(TARGET_CAP + 5);
    expect(res.generated_at).toBe(NOW);
  });
});
