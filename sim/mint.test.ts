import { describe, it, expect } from "vitest";
import { assertSyntheticEmail, personaToCreateUser } from "./mint";
import type { Persona } from "./personas";

const biz: Persona = {
  email: "bot009@synthetic.dragoncandy.test",
  fullName: "Carmine's Hoboken",
  role: "business_client",
  personaKey: "hoboken_restaurant",
  cohort: "phase1",
};
const creator: Persona = {
  email: "bot001@synthetic.dragoncandy.test",
  fullName: "Zoe Kim",
  role: "content_creator",
  personaKey: "nyc_genz_creator",
  cohort: "phase1",
};

describe("assertSyntheticEmail", () => {
  it("accepts a @synthetic.dragoncandy.test address", () => {
    expect(() => assertSyntheticEmail(creator.email)).not.toThrow();
  });
  it("throws on any other domain", () => {
    expect(() => assertSyntheticEmail("someone@dragoncandy.io")).toThrow();
  });
  it("throws on a look-alike subdomain suffix (no smuggling)", () => {
    expect(() => assertSyntheticEmail("x@synthetic.dragoncandy.test.evil.com")).toThrow();
  });
});

describe("personaToCreateUser", () => {
  it("maps a business persona to role business_client + full_name, no account_type key", () => {
    const u = personaToCreateUser(biz);
    // role is the load-bearing field: handle_new_user derives account_type from it.
    expect(u.user_metadata).toEqual({ role: "business_client", full_name: "Carmine's Hoboken" });
    expect(u.email_confirm).toBe(true);
    expect(u.email).toBe(biz.email);
  });
  it("maps a creator persona to role content_creator", () => {
    expect(personaToCreateUser(creator).user_metadata.role).toBe("content_creator");
  });
  it("refuses to build a create-user payload for a non-synthetic email", () => {
    expect(() => personaToCreateUser({ ...creator, email: "x@dragoncandy.io" })).toThrow();
  });
});
