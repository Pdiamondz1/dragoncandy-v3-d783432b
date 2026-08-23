// supabase/functions/_shared/chunk-doc.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { chunkDocument, chunkSourceId, HARD_MAX_CHARS, TARGET_CHARS } from "./chunk-doc";

/** Every non-blank line of the source, so "did we lose anything" is answerable exactly. */
function lines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

describe("chunkDocument", () => {
  it("leaves a document that already fits byte-identical", () => {
    const doc = "Small\n\n# Small\n\nA short document.";
    expect(chunkDocument(doc, "Small")).toEqual([doc]);
  });

  it("keeps every line of a long document, and no chunk exceeds the ceiling", () => {
    const doc = Array.from(
      { length: 40 },
      (_, i) => `## Section ${i}\n\n${`Body line ${i}. `.repeat(60)}`,
    ).join("\n\n");
    const chunks = chunkDocument(doc, "Long Doc");

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(HARD_MAX_CHARS);

    // Nothing dropped: every non-blank source line survives somewhere.
    const joined = chunks.join("\n");
    expect(lines(doc).filter((l) => !joined.includes(l))).toEqual([]);
  });

  it("names the document on every chunk, so a chunk retrieved alone still says what it is", () => {
    const doc = Array.from({ length: 30 }, (_, i) => `## H${i}\n\n${"x ".repeat(300)}`).join("\n\n");
    const chunks = chunkDocument(doc, "Design System");
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.startsWith("Design System")).toBe(true);
    expect(chunks[1]).toMatch(/^Design System — part 2 of \d+/);
  });

  it("splits on heading boundaries rather than mid-section", () => {
    const doc = Array.from({ length: 12 }, (_, i) => `## Rule ${i}\n\n${"y ".repeat(700)}`).join("\n\n");
    const chunks = chunkDocument(doc, "Rules");
    expect(chunks.length).toBeGreaterThan(1);
    // Each continuation chunk opens (after its label line) on a heading.
    for (const c of chunks.slice(1)) {
      const firstBodyLine = c.split("\n\n").slice(1).join("\n\n").split("\n")[0];
      expect(firstBodyLine.startsWith("## ")).toBe(true);
    }
  });

  it("hard-splits a single paragraph bigger than the budget instead of dropping it", () => {
    const giant = "z".repeat(TARGET_CHARS * 3);
    const chunks = chunkDocument(`## One\n\n${giant}`, "Giant");
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(HARD_MAX_CHARS);
    expect(chunks.join("").split("z").length - 1).toBe(giant.length);
  });

  /**
   * The regression itself. DESIGN_SYSTEM.md is 30,668 chars; the old 24,000-char slice cut it
   * mid-sentence inside the safe-area rule, so the rules written after that point — the logo
   * sizing rule, the body-scroller rule, the public-page dashboard rule — reached Donny in no
   * form at all. Verified against the live store on 2026-08-23: content ilike
   * '%PublicPageHeader.test.tsx%' returned zero rows.
   */
  it("carries the tail of DESIGN_SYSTEM.md that the old 24k slice dropped", () => {
    const raw = readFileSync("docs/DESIGN_SYSTEM.md", "utf8");
    expect(raw.length).toBeGreaterThan(24_000); // guard: this test is only meaningful oversize

    const joined = chunkDocument(raw, "DESIGN_SYSTEM").join("\n");

    // Markers are single unbroken tokens ON PURPOSE. A multi-word phrase can straddle a markdown
    // line-wrap and then matches nothing even when the text is present — which is how the
    // knowledge-sync content probe gives a false negative, and how the first draft of this test
    // failed on "is the document's scroll container" (wrapped after "document's").
    for (const marker of [
      "PublicPageHeader.test.tsx",
      "HelpCenter.test.tsx",
      "layoutViewportHeight.test.ts",
      "h-12 w-auto lg:h-14",
    ]) {
      expect(raw).toContain(marker); // the marker is really in the source
      expect(raw.indexOf(marker)).toBeGreaterThan(24_000); // and really past the old cap
      expect(joined).toContain(marker); // and now survives chunking
    }
  });
});

describe("chunkSourceId", () => {
  it("leaves chunk 0 unsuffixed so existing rows update in place", () => {
    expect(chunkSourceId("internal-doc:DESIGN_SYSTEM", 0)).toBe("internal-doc:DESIGN_SYSTEM");
  });

  it("suffixes continuation chunks", () => {
    expect(chunkSourceId("internal-doc:DESIGN_SYSTEM", 2)).toBe("internal-doc:DESIGN_SYSTEM#2");
  });
});
