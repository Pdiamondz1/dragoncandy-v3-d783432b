import { describe, it, expect } from "vitest";
import { initials, paletteFor } from "./monogram";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Joe's Pizza")).toBe("JP");
  });

  it("falls back to the first two letters of a single word", () => {
    expect(initials("Rosticceria")).toBe("RO");
  });

  it("ignores punctuation, articles and bare numerals", () => {
    expect(initials("  The   #1 Taco-Truck ")).toBe("TT");
  });

  it("handles non-ASCII names without throwing", () => {
    expect(initials("Café Ñoño")).toBe("CÑ");
  });

  it("never returns empty for a name with no letters", () => {
    expect(initials("### 123")).toBe("DC");
  });
});

describe("paletteFor", () => {
  it("is deterministic and returns brand colours", () => {
    const a = paletteFor("user-1");
    expect(paletteFor("user-1")).toEqual(a);
    expect(a.bg).toHaveLength(3);
    expect(a.fg).toHaveLength(3);
  });

  it("spreads across more than one palette", () => {
    const seen = new Set(
      Array.from({ length: 50 }, (_, i) => JSON.stringify(paletteFor(`user-${i}`).bg)),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});
