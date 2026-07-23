import { describe, it, expect } from "vitest";
import { generateCohort, personaRole } from "./personas";

describe("generateCohort", () => {
  it("produces N personas at the requested creator/business split", () => {
    const cohort = generateCohort(25, { creators: 0.65 }, 1);
    expect(cohort).toHaveLength(25);
    expect(cohort.filter((p) => p.role === "content_creator")).toHaveLength(16);
    expect(cohort.filter((p) => p.role === "business_client")).toHaveLength(9);
  });

  it("mints only synthetic emails, all unique", () => {
    const cohort = generateCohort(25, { creators: 0.65 }, 1);
    for (const p of cohort) {
      expect(p.email).toMatch(/^bot\d+@synthetic\.dragoncandy\.test$/);
    }
    expect(new Set(cohort.map((p) => p.email)).size).toBe(25);
  });

  it("is deterministic for a given seed (same seed → deep-equal)", () => {
    expect(generateCohort(25, { creators: 0.65 }, 1)).toEqual(
      generateCohort(25, { creators: 0.65 }, 1),
    );
  });

  it("maps personaKey → role correctly", () => {
    expect(personaRole("hoboken_restaurant")).toBe("business_client");
    expect(personaRole("luxury_lifestyle_creator")).toBe("content_creator");
    expect(personaRole("nyc_genz_creator")).toBe("content_creator");
  });

  it("every business is a hoboken_restaurant; every creator is luxury or gen-z", () => {
    const cohort = generateCohort(25, { creators: 0.65 }, 1);
    for (const p of cohort) {
      if (p.role === "business_client") {
        expect(p.personaKey).toBe("hoboken_restaurant");
      } else {
        expect(["luxury_lifestyle_creator", "nyc_genz_creator"]).toContain(p.personaKey);
      }
    }
  });

  it("stamps every persona with the given cohort label", () => {
    const cohort = generateCohort(10, { creators: 0.6 }, 7, "smoke");
    expect(cohort.every((p) => p.cohort === "smoke")).toBe(true);
  });
});
