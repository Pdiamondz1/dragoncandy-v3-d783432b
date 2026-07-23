import { describe, it, expect } from "vitest";
import { assertBootSafety } from "./env";

describe("assertBootSafety", () => {
  it("throws on a live Stripe key", () => {
    expect(() => assertBootSafety({ stripeSecret: "sk_live_x", stripePublishable: "pk_test_x", killSwitch: true }))
      .toThrow(/test/i);
  });
  it("throws when the kill switch is off/unreadable (fail-closed)", () => {
    expect(() => assertBootSafety({ stripeSecret: "sk_test_x", stripePublishable: "pk_test_x", killSwitch: false }))
      .toThrow(/enabled/i);
    expect(() => assertBootSafety({ stripeSecret: "sk_test_x", stripePublishable: "pk_test_x", killSwitch: null }))
      .toThrow(/enabled/i);
  });
  it("passes with test keys + kill switch on", () => {
    expect(() => assertBootSafety({ stripeSecret: "sk_test_x", stripePublishable: "pk_test_x", killSwitch: true }))
      .not.toThrow();
  });
});
