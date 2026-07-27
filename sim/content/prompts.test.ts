import { describe, it, expect } from "vitest";
import { workPrompt } from "./prompts";
import { workPath } from "../avatars/pool";

describe("workPath", () => {
  it("zero-pads under the durable work prefix and follows the extension", () => {
    expect(workPath(7)).toBe("synthetic/work/0007.jpg");
    expect(workPath(1799, "png")).toBe("synthetic/work/1799.png");
  });
});

describe("workPrompt", () => {
  it("is deterministic per index", () => {
    expect(workPrompt(42)).toBe(workPrompt(42));
  });

  it("varies across the subject matrix", () => {
    expect(workPrompt(0)).not.toBe(workPrompt(7));
    expect(new Set(Array.from({ length: 40 }, (_, i) => workPrompt(i))).size).toBeGreaterThan(20);
  });

  // Spec §4.2: a portfolio full of generated faces would be a second, unmanaged population of
  // people outside the faces pool, with the same impersonation questions and none of the accounting.
  it("never asks for a portrait or a person as the subject", () => {
    for (let i = 0; i < 60; i++) {
      const p = workPrompt(i).toLowerCase();
      expect(p).not.toMatch(/portrait|headshot|face|person in their|man in his|woman in her/);
    }
  });

  it("asks for hospitality subject matter", () => {
    const joined = Array.from({ length: 40 }, (_, i) => workPrompt(i))
      .join(" ")
      .toLowerCase();
    for (const subject of ["dish", "cocktail", "interior", "storefront", "kitchen"]) {
      expect(joined).toContain(subject);
    }
  });

  it("states the scene is fictional", () => {
    expect(workPrompt(3).toLowerCase()).toMatch(/fictional/);
  });
});
