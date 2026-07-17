import { describe, it, expect } from "vitest";
import { parseRoleParam, visibleRoles, HERO_CONTENT, type HeroRole } from "./heroRole";

describe("visibleRoles", () => {
  it("hides brand when the flag is off", () => {
    expect(visibleRoles(false)).toEqual(["business", "creator"]);
  });
  it("shows brand when the flag is on", () => {
    expect(visibleRoles(true)).toEqual(["business", "creator", "brand"]);
  });
});

describe("parseRoleParam", () => {
  it("returns a valid visible role", () => {
    expect(parseRoleParam("creator", false)).toBe("creator");
  });
  it("falls back to business for a gated role when brand is off", () => {
    expect(parseRoleParam("brand", false)).toBe("business");
  });
  it("accepts brand when the flag is on", () => {
    expect(parseRoleParam("brand", true)).toBe("brand");
  });
  it("rejects inherited prop names (prototype-pollution guard)", () => {
    expect(parseRoleParam("constructor", true)).toBe("business");
    expect(parseRoleParam("toString", true)).toBe("business");
  });
  it("falls back to business for null/unknown", () => {
    expect(parseRoleParam(null, true)).toBe("business");
    expect(parseRoleParam("nope", true)).toBe("business");
  });
});

describe("HERO_CONTENT", () => {
  it("has content + a signup role for every role", () => {
    (["business", "creator", "brand"] as HeroRole[]).forEach((r) => {
      expect(HERO_CONTENT[r].headline.length).toBeGreaterThan(0);
      expect(HERO_CONTENT[r].signupRole).toBe(r);
      expect(HERO_CONTENT[r].clipKey).toContain("hero.");
    });
  });
});
