import { describe, it, expect, vi } from "vitest";
import { CAPS, resolveCount, overCapReason } from "./web-tools-core.ts";

describe("resolveCount (fail-closed)", () => {
  it("errored count → MAX_SAFE_INTEGER (blocks, not opens)", () => {
    expect(resolveCount({ count: null, error: { message: "boom" } })).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("returns the count when clean", () => expect(resolveCount({ count: 4, error: null })).toBe(4));
  it("null count, no error → 0", () => expect(resolveCount({ count: null, error: null })).toBe(0));
});

describe("overCapReason", () => {
  const deps = (user: number, global: number) => ({
    count: vi.fn(async (_a: any, uid: string | null) => (uid ? user : global)),
    now: () => new Date("2026-07-16T00:00:00Z"),
  });
  it("internal bypasses — no count call, null", async () => {
    const d = deps(9999, 9999);
    expect(await overCapReason({ supabaseAdmin: {}, userId: "u1", internal: true }, d)).toBeNull();
    expect(d.count).not.toHaveBeenCalled();
  });
  it("under cap → null", async () => {
    expect(await overCapReason({ supabaseAdmin: {}, userId: "u1", internal: false }, deps(0, 0))).toBeNull();
  });
  it("over per-user cap → limit message", async () => {
    expect(await overCapReason({ supabaseAdmin: {}, userId: "u1", internal: false }, deps(CAPS.perUser, 0))).toMatch(/limit/i);
  });
  it("over global cap → busy message", async () => {
    expect(await overCapReason({ supabaseAdmin: {}, userId: "u1", internal: false }, deps(0, CAPS.global))).toMatch(/busy|later/i);
  });
});
