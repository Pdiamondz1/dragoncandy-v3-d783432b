import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHotActions, WRITE_ACTION_NAMES } from "./actions-mix";
import type { HotActionContext } from "./driver";

const ctx: HotActionContext = { selfId: "self-uuid", peerId: "peer-uuid" };

// A minimal client recorder covering ONLY what the write actions call: from(t).insert(p) (awaitable),
// from(t).insert(p).select().single() (donny conversation → id), and functions.invoke(name,{body}).
interface Recorder {
  inserts: { table: string; payload: Record<string, unknown> }[];
  invokes: { name: string; body: Record<string, unknown> }[];
}
function fakeClient(rec: Recorder, opts: { insertError?: { message: string } } = {}): SupabaseClient {
  const insertResult = (table: string, payload: Record<string, unknown>) => {
    rec.inserts.push({ table, payload });
    const result = {
      data: table === "donny_conversations" ? { id: "conv-1" } : null,
      error: opts.insertError ?? null,
    };
    return {
      select: () => ({ single: async () => result, maybeSingle: async () => result }),
      then: (resolve: (r: typeof result) => unknown) => resolve(result), // thenable for a bare await
    };
  };
  return {
    from: (table: string) => ({ insert: (payload: Record<string, unknown>) => insertResult(table, payload) }),
    functions: {
      invoke: async (name: string, o?: { body?: Record<string, unknown> }) => {
        rec.invokes.push({ name, body: o?.body ?? {} });
        return { data: {}, error: opts.insertError ?? null };
      },
    },
  } as unknown as SupabaseClient;
}

const CREW_TABLES = ["creator_groups", "creator_group_members", "crew_activity"];
const EXPECTED_NAMES = [
  "dragonfeed_feed",
  "dragonfeed_grid",
  "media_fetch",
  "campaign_browse",
  "campaign_search",
  "geo_near_me",
  "profile_view",
  "campaign_write",
  "notify_peer",
  "donny_footprint",
];

describe("buildHotActions — the realistic DAU behavior mix", () => {
  it("includes every named DAU action (feed/grid/media/browse/search/geo/profile + 3 writes)", () => {
    const names = buildHotActions().map((a) => a.name);
    for (const n of EXPECTED_NAMES) expect(names).toContain(n);
  });

  it("is ~90:10 read:write by weight", () => {
    const actions = buildHotActions();
    const total = actions.reduce((s, a) => s + a.weight, 0);
    const writeWeight = actions
      .filter((a) => WRITE_ACTION_NAMES.includes(a.name))
      .reduce((s, a) => s + a.weight, 0);
    const writeShare = writeWeight / total;
    expect(writeShare).toBeGreaterThanOrEqual(0.08);
    expect(writeShare).toBeLessThanOrEqual(0.12);
  });

  it("campaign_write inserts a PUBLIC-FREE DRAFT owned by the caller — never a crew campaign", async () => {
    const rec: Recorder = { inserts: [], invokes: [] };
    const write = buildHotActions().find((a) => a.name === "campaign_write")!;
    await write.run(fakeClient(rec), ctx);
    const ins = rec.inserts.find((i) => i.table === "campaigns")!;
    expect(ins).toBeDefined();
    expect(ins.payload.user_id).toBe(ctx.selfId); // RLS-real: owns its own row
    expect(ins.payload.group_id).toBeNull(); // public path (NOT a crew campaign)
    expect(ins.payload.status).toBe("draft"); // limit-trigger exempt + invisible to real browse
    expect(ins.payload.fixed_price).toBe(0);
    // No crew table is ever written.
    for (const t of CREW_TABLES) expect(rec.inserts.some((i) => i.table === t)).toBe(false);
  });

  it("campaign_write is fail-loud (throws on the insert error, like the read actions)", async () => {
    const rec: Recorder = { inserts: [], invokes: [] };
    const write = buildHotActions().find((a) => a.name === "campaign_write")!;
    await expect(write.run(fakeClient(rec, { insertError: { message: "boom" } }), ctx)).rejects.toThrow(/boom/);
  });

  it("notify_peer targets the synthetic PEER (never a real user) via create-notification", async () => {
    const rec: Recorder = { inserts: [], invokes: [] };
    const notify = buildHotActions().find((a) => a.name === "notify_peer")!;
    await notify.run(fakeClient(rec), ctx);
    const call = rec.invokes.find((i) => i.name === "create-notification")!;
    expect(call).toBeDefined();
    expect(call.body.recipientId).toBe(ctx.peerId); // the driver guarantees peerId is a synthetic cohort bot
    expect(call.body.category).toBe("content"); // email-off category (+ synthetic recipient suppresses email)
  });

  it("donny_footprint writes a web conversation + a user message (no crew tables, no donny edge call)", async () => {
    const rec: Recorder = { inserts: [], invokes: [] };
    const donny = buildHotActions().find((a) => a.name === "donny_footprint")!;
    await donny.run(fakeClient(rec), ctx);
    const conv = rec.inserts.find((i) => i.table === "donny_conversations")!;
    const msg = rec.inserts.find((i) => i.table === "donny_messages")!;
    expect(conv.payload).toMatchObject({ user_id: ctx.selfId, surface: "web" });
    expect(msg.payload).toMatchObject({ conversation_id: "conv-1", role: "user" });
    expect(rec.invokes).toHaveLength(0); // direct inserts — NO donny-* edge function call
    for (const t of CREW_TABLES) expect(rec.inserts.some((i) => i.table === t)).toBe(false);
  });

  it("media_fetch does a real HEAD and returns { bytes } from Content-Length", async () => {
    let method: string | undefined;
    const fetchImpl = (async (_url: string, o?: { method?: string }) => {
      method = o?.method;
      return { ok: true, status: 200, headers: { get: (h: string) => (h.toLowerCase() === "content-length" ? "54321" : null) } };
    }) as unknown as typeof fetch;
    const media = buildHotActions({ mediaUrls: ["http://cdn/vid.mp4"], fetchImpl }).find((a) => a.name === "media_fetch")!;
    const res = await media.run({} as SupabaseClient, ctx);
    expect(method).toBe("HEAD"); // a proxy read — never downloads the full asset (would self-inflict egress)
    expect(res).toEqual({ bytes: 54321 });
  });

  it("media_fetch is fail-loud on a non-2xx CDN response", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 503, headers: { get: () => null } })) as unknown as typeof fetch;
    const media = buildHotActions({ mediaUrls: ["http://cdn/x.mp4"], fetchImpl }).find((a) => a.name === "media_fetch")!;
    await expect(media.run({} as SupabaseClient, ctx)).rejects.toThrow(/503/);
  });
});
