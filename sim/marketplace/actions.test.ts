import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage, postDragonFeed, createDiscount } from "./actions";

interface Rec {
  rpcs: { fn: string; params: Record<string, unknown> }[];
  inserts: { table: string; payload: Record<string, unknown> }[];
}
interface FakeClientOpts {
  rpcData?: unknown; // explicit `null` is honored (NOT coalesced) — only an omitted key defaults to "conv-1"
  insertData?: unknown; // explicit `null`/`{}` is honored — only an omitted key defaults per-table
  error?: { message: string }; // backward-compat: applied to BOTH rpc and insert unless the specific opt below is set
  rpcError?: { message: string };
  insertError?: { message: string };
}
function fakeClient(rec: Rec, opts: FakeClientOpts = {}): SupabaseClient {
  const insertResult = (table: string, payload: Record<string, unknown>) => {
    rec.inserts.push({ table, payload });
    const data = opts.insertData !== undefined ? opts.insertData : table === "promotions" ? { id: "promo-1" } : null;
    const result = { data, error: opts.insertError ?? opts.error ?? null };
    return {
      select: () => ({ single: async () => result, maybeSingle: async () => result }),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
  };
  return {
    from: (table: string) => ({ insert: (payload: Record<string, unknown>) => insertResult(table, payload) }),
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rec.rpcs.push({ fn, params });
      const data = opts.rpcData !== undefined ? opts.rpcData : "conv-1";
      return { data, error: opts.rpcError ?? opts.error ?? null };
    },
  } as unknown as SupabaseClient;
}

describe("marketplace net-new actions", () => {
  it("sendMessage opens a direct conversation then inserts a message from the business to the creator", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    const convId = await sendMessage(fakeClient(rec, { rpcData: "conv-9" }), {
      bizId: "biz-1", creatorId: "cr-1", content: "hi",
    });
    expect(convId).toBe("conv-9");
    const rpc = rec.rpcs.find((r) => r.fn === "create_or_get_direct_conversation")!;
    expect(rpc.params).toMatchObject({ user1_uuid: "biz-1", user2_uuid: "cr-1" });
    const msg = rec.inserts.find((i) => i.table === "messages")!;
    expect(msg.payload).toMatchObject({ conversation_id: "conv-9", sender_id: "biz-1", recipient_id: "cr-1", content: "hi" });
  });

  it("sendMessage is fail-loud on an RPC error", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await expect(
      sendMessage(fakeClient(rec, { error: { message: "boom" } }), { bizId: "b", creatorId: "c", content: "x" }),
    ).rejects.toThrow(/boom/);
  });

  it("sendMessage is fail-loud when the message insert errors (RPC still succeeds)", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await expect(
      sendMessage(fakeClient(rec, { insertError: { message: "insert boom" } }), {
        bizId: "b", creatorId: "c", content: "x",
      }),
    ).rejects.toThrow(/insert boom/);
    // the RPC did fire (and succeeded) before the insert failed
    expect(rec.rpcs).toHaveLength(1);
  });

  it("sendMessage throws when create_or_get_direct_conversation returns no id", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await expect(
      sendMessage(fakeClient(rec, { rpcData: null }), { bizId: "b", creatorId: "c", content: "x" }),
    ).rejects.toThrow(/returned no id/);
    // never reached the message insert
    expect(rec.inserts).toHaveLength(0);
  });

  it("sendMessage forwards a supplied orgUnitId as p_org_unit_id", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await sendMessage(fakeClient(rec, { rpcData: "conv-9" }), {
      bizId: "biz-1", creatorId: "cr-1", content: "hi", orgUnitId: "org-9",
    });
    const rpc = rec.rpcs.find((r) => r.fn === "create_or_get_direct_conversation")!;
    expect(rpc.params).toMatchObject({ p_org_unit_id: "org-9" });
  });

  it("postDragonFeed inserts a verified, available post owned by the creator", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await postDragonFeed(fakeClient(rec), {
      creatorId: "cr-1", targetOrgId: "org-1", contentType: "video",
      contentFilePath: "https://x/y.mp4", caption: "nice",
    });
    const post = rec.inserts.find((i) => i.table === "dragonshare_posts")!;
    expect(post.payload).toMatchObject({
      creator_id: "cr-1", target_org_id: "org-1", content_type: "video",
      content_file_path: "https://x/y.mp4", status: "verified", boost_status: "available",
    });
  });

  it("postDragonFeed is fail-loud when the dragonshare_posts insert errors", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await expect(
      postDragonFeed(fakeClient(rec, { insertError: { message: "post boom" } }), {
        creatorId: "cr-1", targetOrgId: "org-1", contentType: "video",
        contentFilePath: "https://x/y.mp4", caption: "nice",
      }),
    ).rejects.toThrow(/post boom/);
  });

  it("createDiscount inserts an ACTIVE, owner-scoped promotion and returns its id", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    const id = await createDiscount(fakeClient(rec), {
      userId: "biz-1", businessId: "bp-1", title: "15% off", discountType: "percentage",
      discountValue: 15, startDate: "2026-07-25", endDate: "2026-08-24",
    });
    expect(id).toBe("promo-1");
    const promo = rec.inserts.find((i) => i.table === "promotions")!;
    expect(promo.payload).toMatchObject({
      user_id: "biz-1", business_id: "bp-1", status: "active", discount_type: "percentage", discount_value: 15,
    });
  });

  it("createDiscount is fail-loud when the promotions insert errors", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await expect(
      createDiscount(fakeClient(rec, { insertError: { message: "promo boom" } }), {
        userId: "biz-1", businessId: "bp-1", title: "15% off", discountType: "percentage",
        discountValue: 15, startDate: "2026-07-25", endDate: "2026-08-24",
      }),
    ).rejects.toThrow(/promo boom/);
  });

  it("createDiscount throws when the promotions insert returns no id", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await expect(
      createDiscount(fakeClient(rec, { insertData: {} }), {
        userId: "biz-1", businessId: "bp-1", title: "15% off", discountType: "percentage",
        discountValue: 15, startDate: "2026-07-25", endDate: "2026-08-24",
      }),
    ).rejects.toThrow(/returned no id/);
  });
});
