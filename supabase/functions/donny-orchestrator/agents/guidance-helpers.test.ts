// supabase/functions/donny-orchestrator/agents/guidance-helpers.test.ts
import { describe, it, expect } from "vitest";
import { stripHtml } from "./guidance-helpers.ts";

describe("stripHtml", () => {
  it("removes tags and collapses whitespace", () => {
    const html = "<p>Hello <strong>world</strong></p>\n<ul><li>one</li><li>two</li></ul>";
    expect(stripHtml(html, 200)).toBe("Hello world one two");
  });

  it("truncates to maxLen without cutting mid-run past the limit", () => {
    const out = stripHtml("<p>" + "a".repeat(500) + "</p>", 200);
    expect(out.length).toBe(200);
  });

  it("is null/undefined-safe", () => {
    expect(stripHtml(undefined, 200)).toBe("");
    expect(stripHtml(null, 200)).toBe("");
    expect(stripHtml("", 200)).toBe("");
  });

  it("decodes the common named entities help bodies use", () => {
    expect(stripHtml("<p>Tips &amp; tricks &mdash; go</p>", 200)).toBe("Tips & tricks — go");
  });

  it("defaults maxLen to 200 when omitted", () => {
    expect(stripHtml("<p>" + "b".repeat(300) + "</p>")).toHaveLength(200);
  });
});
