import { describe, it, expect } from "vitest";
import { assertSessionMintTarget } from "./session";

const URL = "https://zocahiffooqdybdhguqv.supabase.co";

describe("assertSessionMintTarget", () => {
  it("accepts a synthetic email against a supabase url", () => {
    expect(assertSessionMintTarget(URL, "bot001@synthetic.dragoncandy.test")).toBe(URL);
  });
  it("refuses a non-synthetic email — never mint a session for a real user", () => {
    expect(() => assertSessionMintTarget(URL, "real@dragoncandy.io")).toThrow();
  });
  it("refuses a missing url", () => {
    expect(() => assertSessionMintTarget(undefined, "bot001@synthetic.dragoncandy.test")).toThrow();
  });
  it("refuses a non-supabase url (no token leak to a foreign host)", () => {
    expect(() =>
      assertSessionMintTarget("https://evil.example.com", "bot001@synthetic.dragoncandy.test"),
    ).toThrow();
  });
});
