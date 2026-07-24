import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSyntheticEmail, personaToCreateUser, readSessionCapableBots } from "./mint";
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

describe("readSessionCapableBots (load drives only bots that can hold a JWT)", () => {
  /** Fake client for the from().select().like().not() → {data,error} chain the loader uses. */
  function fakeClient(result: {
    data: unknown;
    error: { message: string } | null;
  }): SupabaseClient {
    const terminal = Promise.resolve(result);
    const notNode = { not: () => terminal };
    const likeNode = { like: () => notNode };
    const selectNode = { select: () => likeNode };
    return { from: () => selectNode } as unknown as SupabaseClient;
  }

  it("maps id/email/role to bot refs and, as a belt-and-suspenders guard, drops any depth-pool row", async () => {
    // Includes a botseed_ row as if the DB .not-like filter had been bypassed — the client guard must drop it.
    const svc = fakeClient({
      data: [
        { id: "u1", email: "bot001@synthetic.dragoncandy.test", role: "content_creator" },
        { id: "u2", email: "botla7_1@synthetic.dragoncandy.test", role: "business_client" },
        { id: "u3", email: "botseed_load_1@synthetic.dragoncandy.test", role: "content_creator" },
      ],
      error: null,
    });
    const bots = await readSessionCapableBots(svc);
    expect(bots.map((b) => b.userId)).toEqual(["u1", "u2"]); // u3 (depth pool) filtered out
    expect(bots[0]).toMatchObject({ userId: "u1", email: "bot001@synthetic.dragoncandy.test", role: "content_creator" });
    expect(bots[1].role).toBe("business_client");
  });

  it("fails loud when the query errors", async () => {
    const svc = fakeClient({ data: null, error: { message: "boom" } });
    await expect(readSessionCapableBots(svc)).rejects.toThrow(/readSessionCapableBots: boom/);
  });

  it("returns an empty list (not a throw) when no session-capable bots exist", async () => {
    const svc = fakeClient({ data: [], error: null });
    await expect(readSessionCapableBots(svc)).resolves.toEqual([]);
  });
});
