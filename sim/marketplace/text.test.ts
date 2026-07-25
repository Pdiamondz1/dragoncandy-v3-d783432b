import { describe, it, expect } from "vitest";
import {
  makePicker,
  CREATOR_BIOS,
  DISCOUNT_KINDS,
  CAMPAIGN_BRIEFS,
  curatedBrief,
} from "./text";

describe("marketplace curated text", () => {
  it("makePicker is deterministic for a given seed", () => {
    const a = makePicker(3);
    const b = makePicker(3);
    expect(a.pick(CREATOR_BIOS)).toBe(b.pick(CREATOR_BIOS));
  });

  it("pools are non-empty and typed", () => {
    expect(CREATOR_BIOS.length).toBeGreaterThan(5);
    expect(DISCOUNT_KINDS[0]).toHaveProperty("discount_type");
    expect(DISCOUNT_KINDS[0]).toHaveProperty("discount_value");
    expect(CAMPAIGN_BRIEFS[0]).toHaveProperty("title");
  });

  it("curatedBrief returns a title + description drawn from the pool", () => {
    const brief = curatedBrief(makePicker(1));
    expect(typeof brief.title).toBe("string");
    expect(brief.title.length).toBeGreaterThan(0);
    expect(typeof brief.description).toBe("string");
  });
});
