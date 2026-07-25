import { describe, it, expect } from "vitest";
import {
  MARKETPLACE_EMAIL_PREFIX,
  isMarketplaceEmail,
  marketplaceEmail,
  generateMarketplaceCohort,
} from "./personas";

describe("marketplace personas", () => {
  it("marketplaceEmail is a botmk_ synthetic address, role-tagged and 1-indexed", () => {
    expect(marketplaceEmail(1, "business_client", 0)).toBe("botmk_b_1_1@synthetic.dragoncandy.test");
    expect(marketplaceEmail(2, "content_creator", 4)).toBe("botmk_c_2_5@synthetic.dragoncandy.test");
    expect(marketplaceEmail(1, "business_client", 0).startsWith(MARKETPLACE_EMAIL_PREFIX)).toBe(true);
  });

  it("isMarketplaceEmail matches only botmk_ addresses", () => {
    expect(isMarketplaceEmail("botmk_b_1_1@synthetic.dragoncandy.test")).toBe(true);
    expect(isMarketplaceEmail("botla1_1@synthetic.dragoncandy.test")).toBe(false);
    expect(isMarketplaceEmail("bot001@synthetic.dragoncandy.test")).toBe(false);
    expect(isMarketplaceEmail("botseed_phase1_3@synthetic.dragoncandy.test")).toBe(false);
  });

  it("generateMarketplaceCohort yields the requested counts, roles, and unique botmk emails", () => {
    const cohort = generateMarketplaceCohort(100, 300, 1);
    expect(cohort).toHaveLength(400);
    expect(cohort.filter((p) => p.role === "business_client")).toHaveLength(100);
    expect(cohort.filter((p) => p.role === "content_creator")).toHaveLength(300);
    expect(cohort.every((p) => isMarketplaceEmail(p.email))).toBe(true);
    expect(new Set(cohort.map((p) => p.email)).size).toBe(400);
  });

  it("is deterministic — same (b,c,seed) yields identical cohorts", () => {
    expect(generateMarketplaceCohort(10, 30, 7)).toEqual(generateMarketplaceCohort(10, 30, 7));
  });
});
