// The realistic DAU behavior mix the load driver fires — ~90% reads / ~10% sampled writes, each a
// real hot endpoint a synthetic bot's RLS permits (or a public-free is_synthetic write via the
// caller's OWN JWT, RLS-real). This is the default action set for sim/load/driver.ts.
//
// Design stances (all verified read-only against prod zocahiffooqdybdhguqv, 2026-07-24 — do NOT
// re-fabricate):
//   • Reads reuse the column sets already validated on prod (see driver.ts history): campaigns
//     (id,title,status,created_at) gated status='published' AND group_id IS NULL; dragonshare_posts
//     (…,content_file_path,…) status='verified'; public_creator_profiles (id,creator_name,location,
//     average_rating). Extra filters (ilike search, location-not-null, ordering) don't change the
//     table-level RLS, so they add no new permission-denied surface.
//   • WRITES are role-AGNOSTIC — campaigns INSERT RLS is `with_check (user_id = auth.uid())` (no
//     account-type gate), donny_* INSERT is own-row, create-notification takes any authenticated
//     caller. So a random drawn bot can perform any write; no driver role-awareness is needed.
//   • campaign_write inserts a **draft** public-free campaign: enforce_active_campaign_limit only
//     fires on status='published' AND group_id IS NULL, so a draft is limit-exempt (repeatable under
//     soak) AND invisible to real users' browse (which filters status='published'). Still
//     is_synthetic + teardown-cleaned (campaigns cascade on the user delete).
//   • notify_peer calls create-notification bot→bot with recipientId = the driver's synthetic peer;
//     the fn already suppresses outbound email to is_synthetic recipients, and category 'content' is
//     email-off by default — so no real person is ever emailed. actor_id = self (a synthetic cohort
//     bot) is cleaned by purge_synthetic_load_cohort()'s actor_id leaf-delete (NO-ACTION FK).
//   • donny_footprint inserts donny_conversations (surface='web' — the INSERT RLS forbids 'internal')
//     + donny_messages (role='user'; user_id OMITTED — it is a nullable NO-ACTION FK, so leaving it
//     null keeps teardown a pure conversation-cascade). NO donny-* edge call.
//   • media_fetch is the egress PROXY (spec §3a/§5): a real HEAD of a sampled public content URL,
//     returning { bytes } from Content-Length. HEAD (not a body GET): the assets are third-party CDN
//     videos and a full-body GET at high concurrency would self-inflict the very egress wall the
//     proxy exists to measure. Returning a (possibly 0-byte) object marks it a media request.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HotAction, HotActionContext, MediaResult } from "./driver";

/** Swappable pool of public, GET/HEAD-able sample media URLs (mirrors the seed_synthetic_content
 *  video pool). cmdLoad may later pass real seeded content_file_paths; this is the default. */
export const SAMPLE_MEDIA_URLS: string[] = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
];

/** The ~10% write leg — used by tests + the runbook to reason about the read:write split. */
export const WRITE_ACTION_NAMES: readonly string[] = ["campaign_write", "notify_peer", "donny_footprint"];

/** Throw the supabase query error (carrying its PG code) so the driver's classifier can read it.
 *  supabase-js returns `{ error }`, it does not throw — so every action must surface it explicitly. */
export function throwOnError(error: { message: string; code?: string } | null): void {
  if (error) {
    const e = new Error(error.message) as Error & { code?: string };
    if (error.code) e.code = error.code;
    throw e;
  }
}

function pick<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

export interface BuildMixOptions {
  /** Media pool for media_fetch (default SAMPLE_MEDIA_URLS). */
  mediaUrls?: string[];
  /** Injectable fetch for offline tests (default: global fetch). */
  fetchImpl?: typeof fetch;
}

/**
 * Build the DAU mix. Weights sum to 100 with a 90:10 read:write split. `run` returns `void` for reads
 * and `{ bytes }` for media_fetch (the driver reads the object-ness as the isMedia flag).
 */
export function buildHotActions(opts: BuildMixOptions = {}): HotAction[] {
  const mediaUrls = opts.mediaUrls?.length ? opts.mediaUrls : SAMPLE_MEDIA_URLS;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const reads: HotAction[] = [
    {
      // Mobile vertical DragonFeed — verified posts, newest-first (the primary consumer read).
      name: "dragonfeed_feed",
      weight: 20,
      run: async (client: SupabaseClient) => {
        const { error } = await client
          .from("dragonshare_posts")
          .select("id, content_file_path, platform, status, created_at")
          .eq("status", "verified")
          .order("created_at", { ascending: false })
          .limit(20);
        throwOnError(error);
      },
    },
    {
      // Desktop grid variant of the same feed (wider page = more rows).
      name: "dragonfeed_grid",
      weight: 10,
      run: async (client: SupabaseClient) => {
        const { error } = await client
          .from("dragonshare_posts")
          .select("id, content_file_path, platform, status, created_at")
          .eq("status", "verified")
          .order("created_at", { ascending: false })
          .limit(30);
        throwOnError(error);
      },
    },
    {
      // Real media egress proxy — a HEAD of a sampled public content URL (Task 4.2). Returns { bytes }.
      name: "media_fetch",
      weight: 15,
      run: async (): Promise<MediaResult> => {
        const url = pick(mediaUrls);
        const res = await fetchImpl(url, { method: "HEAD" });
        if (!res.ok) throw new Error(`media fetch failed: ${res.status} for ${url}`);
        const len = Number(res.headers.get("content-length") ?? 0);
        return { bytes: Number.isFinite(len) ? len : 0 };
      },
    },
    {
      // Campaign browse — published PUBLIC campaigns (the marketplace's primary read).
      name: "campaign_browse",
      weight: 15,
      run: async (client: SupabaseClient) => {
        const { error } = await client
          .from("campaigns")
          .select("id, title, status, created_at")
          .eq("status", "published")
          .is("group_id", null)
          .order("created_at", { ascending: false })
          .limit(20);
        throwOnError(error);
      },
    },
    {
      // Campaign search — the same public gate + a title ilike (a real search-box read path).
      name: "campaign_search",
      weight: 8,
      run: async (client: SupabaseClient) => {
        const { error } = await client
          .from("campaigns")
          .select("id, title, status, created_at")
          .eq("status", "published")
          .is("group_id", null)
          .ilike("title", "%a%")
          .limit(20);
        throwOnError(error);
      },
    },
    {
      // Geo "near me" — the creator directory the client geocodes locally; fetch located creators.
      name: "geo_near_me",
      weight: 12,
      run: async (client: SupabaseClient) => {
        const { error } = await client
          .from("public_creator_profiles")
          .select("id, creator_name, location, average_rating")
          .not("location", "is", null)
          .limit(20);
        throwOnError(error);
      },
    },
    {
      // Profile view — a single creator profile (top-rated first), the tap-through from a feed/list.
      name: "profile_view",
      weight: 10,
      run: async (client: SupabaseClient) => {
        const { error } = await client
          .from("public_creator_profiles")
          .select("id, creator_name, location, average_rating")
          .order("average_rating", { ascending: false, nullsFirst: false })
          .limit(1);
        throwOnError(error);
      },
    },
  ];

  const writes: HotAction[] = [
    {
      // Public-free DRAFT campaign write (limit-exempt, invisible to real browse, is_synthetic).
      // Role-AGNOSTIC by design: the campaigns INSERT policy is `with_check (user_id = auth.uid())`
      // with NO account-type gate, so a content_creator bot inserts successfully too — verified
      // 2026-07-24 by a rollback-wrapped insert probe as a synthetic creator under RLS (succeeded).
      // So this needs no role routing; a creator-owned synthetic draft is harmless + teardown-cleaned.
      name: "campaign_write",
      weight: 4,
      run: async (client: SupabaseClient, ctx: HotActionContext) => {
        const { error } = await client.from("campaigns").insert({
          user_id: ctx.selfId,
          title: "Synthetic DAU draft",
          description: "Synthetic load-test draft campaign (public, free).",
          status: "draft",
          group_id: null,
          fixed_price: 0,
        });
        throwOnError(error);
      },
    },
    {
      // Bot→bot notification to the synthetic peer via create-notification (no real email possible).
      name: "notify_peer",
      weight: 3,
      run: async (client: SupabaseClient, ctx: HotActionContext) => {
        const { error } = await client.functions.invoke("create-notification", {
          body: {
            recipientId: ctx.peerId,
            type: "load_ping",
            category: "content",
            title: "Synthetic load ping",
            body: "Synthetic bot-to-bot notification (load test).",
            actorId: ctx.selfId,
          },
        });
        throwOnError(error as { message: string } | null);
      },
    },
    {
      // Donny footprint — a web conversation + one user message inserted directly (no donny-* edge call).
      name: "donny_footprint",
      weight: 3,
      run: async (client: SupabaseClient, ctx: HotActionContext) => {
        const { data: conv, error: convErr } = await client
          .from("donny_conversations")
          .insert({ user_id: ctx.selfId, surface: "web" })
          .select("id")
          .single();
        throwOnError(convErr);
        const conversationId = (conv as { id: string } | null)?.id;
        if (!conversationId) throw new Error("donny_footprint: conversation insert returned no id");
        const { error: msgErr } = await client
          .from("donny_messages")
          .insert({ conversation_id: conversationId, role: "user", content: "Synthetic load-test message." });
        throwOnError(msgErr);
      },
    },
  ];

  return [...reads, ...writes];
}

/** The full DAU mix (reads + the ~10% write leg). Used by the MATRIX path, which drives the isolated
 *  `botla…` slice that purge_synthetic_load_cohort() cleans — so its writes are teardown-safe. */
export const DAU_ACTIONS: HotAction[] = buildHotActions();

/** The reads-only subset. Used by the SINGLE-RUNNER `load` path, which drives the live `bot0##` daily
 *  cohort (readSessionCapableBots) — the scoped teardown spares bot0##, so a write there would leak
 *  persistent residue only the full purge (which also deletes the live 25) could clean. Reads are the
 *  ceiling signal anyway; the write leg is a matrix-only realism dimension. Also the driver's safe
 *  default (a caller that injects no actions never writes). */
export const DAU_READ_ACTIONS: HotAction[] = DAU_ACTIONS.filter(
  (a) => !WRITE_ACTION_NAMES.includes(a.name),
);
