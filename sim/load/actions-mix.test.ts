import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHotActions, WRITE_ACTION_NAMES } from "./actions-mix";
import type { HotActionContext, MediaResult } from "./driver";

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

  it("media_fetch does a Range-capped GET of a real object and returns { bytes, ok, ms }", async () => {
    let method: string | undefined;
    let range: string | undefined;
    const body = new Uint8Array(1234);
    const fetchImpl = (async (_url: string, o?: { method?: string; headers?: Record<string, string> }) => {
      method = o?.method;
      range = o?.headers?.Range;
      return { ok: true, status: 206, arrayBuffer: async () => body.buffer };
    }) as unknown as typeof fetch;
    const now = (() => { const seq = [100, 142]; let i = 0; return () => seq[i++]; })(); // t0=100, end=142 → ms=42
    const media = buildHotActions({ mediaUrls: ["http://cdn/vid.mp4"], fetchImpl, now }).find((a) => a.name === "media_fetch")!;
    const res = await media.run({} as SupabaseClient, ctx);
    expect(method).toBe("GET");
    expect(range).toBe("bytes=0-262143"); // default 256 KiB cap
    expect(res).toEqual({ bytes: 1234, ok: true, ms: 42 });
  });

  it("media_fetch honors a custom rangeCapBytes", async () => {
    let range: string | undefined;
    const fetchImpl = (async (_url: string, o?: { headers?: Record<string, string> }) => {
      range = o?.headers?.Range;
      return { ok: true, status: 206, arrayBuffer: async () => new ArrayBuffer(10) };
    }) as unknown as typeof fetch;
    const media = buildHotActions({ mediaUrls: ["http://cdn/x"], fetchImpl, rangeCapBytes: 1024 }).find((a) => a.name === "media_fetch")!;
    await media.run({} as SupabaseClient, ctx);
    expect(range).toBe("bytes=0-1023");
  });

  it("media_fetch does NOT throw on a non-2xx response — returns { bytes:0, ok:false } with ms", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) })) as unknown as typeof fetch;
    const media = buildHotActions({ mediaUrls: ["http://cdn/x"], fetchImpl }).find((a) => a.name === "media_fetch")!;
    // HotAction.run is typed Promise<MediaResult | void> (shared with the void-returning read/write
    // actions); media_fetch always resolves a MediaResult, so narrow for the property access below.
    const res = (await media.run({} as SupabaseClient, ctx)) as MediaResult;
    expect(res.bytes).toBe(0);
    expect(res.ok).toBe(false);
    expect(typeof res.ms).toBe("number");
  });

  it("media_fetch does NOT throw on a network error — returns { bytes:0, ok:false } with ms", async () => {
    const fetchImpl = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    const media = buildHotActions({ mediaUrls: ["http://cdn/x"], fetchImpl }).find((a) => a.name === "media_fetch")!;
    const res = (await media.run({} as SupabaseClient, ctx)) as MediaResult;
    expect(res).toMatchObject({ bytes: 0, ok: false });
    expect(typeof res.ms).toBe("number");
  });

  it("media_fetch enforces the egress cap when the host ignores Range (oversized 200) — capped miss, no body download", async () => {
    let bodyRead = false;
    const fetchImpl = (async () => ({
      ok: true,
      status: 200, // ignored Range → would be a full object
      headers: { get: (h: string) => (h.toLowerCase() === "content-length" ? "5000000" : null) }, // 5 MB > 256 KiB cap
      arrayBuffer: async () => { bodyRead = true; return new ArrayBuffer(5_000_000); },
    })) as unknown as typeof fetch;
    const media = buildHotActions({ mediaUrls: ["http://cdn/big.mp4"], fetchImpl }).find((a) => a.name === "media_fetch")!;
    const res = (await media.run({} as SupabaseClient, ctx)) as MediaResult;
    expect(bodyRead).toBe(false); // never downloaded the oversized body
    expect(res).toMatchObject({ bytes: 0, ok: false });
    expect(typeof res.ms).toBe("number");
  });

  it("media_fetch caps a 200 with NO Content-Length (chunked, Range ignored) — capped miss, no body download", async () => {
    let bodyRead = false;
    const fetchImpl = (async () => ({
      ok: true,
      status: 200, // Range ignored, and no Content-Length (chunked)
      headers: { get: () => null },
      arrayBuffer: async () => { bodyRead = true; return new ArrayBuffer(9_000_000); },
    })) as unknown as typeof fetch;
    const media = buildHotActions({ mediaUrls: ["http://cdn/chunked"], fetchImpl }).find((a) => a.name === "media_fetch")!;
    const res = (await media.run({} as SupabaseClient, ctx)) as MediaResult;
    expect(bodyRead).toBe(false);
    expect(res).toMatchObject({ bytes: 0, ok: false });
  });
});
