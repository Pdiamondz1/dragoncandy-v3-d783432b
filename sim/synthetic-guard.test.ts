import { describe, it, expect } from "vitest";
import { shouldRefuseSettlement } from "../supabase/functions/_shared/synthetic-guard";

describe("shouldRefuseSettlement", () => {
  it("refuses a synthetic creator in LIVE mode", () =>
    expect(shouldRefuseSettlement({ isTestMode: false, isSynthetic: true })).toBe(true));
  it("allows a synthetic creator in TEST mode", () =>
    expect(shouldRefuseSettlement({ isTestMode: true, isSynthetic: true })).toBe(false));
  it("allows a real creator in LIVE mode", () =>
    expect(shouldRefuseSettlement({ isTestMode: false, isSynthetic: false })).toBe(false));
});
