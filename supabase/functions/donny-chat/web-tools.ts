// supabase/functions/donny-chat/web-tools.ts
// Metering + orchestration for Donny's web tools. Impure (DB + Tavily), but
// dependency-injected so the cap/bypass/log logic is unit-tested with fakes.
// No Deno.* here — index.ts reads TAVILY_API_KEY and passes it in via ctx.apiKey.

import {
  tavilySearch, tavilyExtract, isOverCap, startOfUtcDayIso, WEB_TIERS,
  type SearchResult, type ExtractResult,
} from "../_shared/tavily.ts";
import { logWebToolCost } from "../_shared/cost-ledger.ts";

export const CAPS = { perUser: 10, global: 500 };

export interface WebToolCtx {
  args: Record<string, any>;
  userId: string;
  supabaseAdmin: any;
  internal: boolean;
  apiKey: string | undefined;
}

export interface WebToolDeps {
  search: (apiKey: string, query: string, recency?: string) => Promise<SearchResult>;
  extract: (apiKey: string, url: string) => Promise<ExtractResult>;
  logCost: (supabaseAdmin: any, entry: { userId: string | null; kind: "web_search" | "web_extract" }) => Promise<void>;
  count: (supabaseAdmin: any, userId: string | null, now: Date) => Promise<number>;
  now: () => Date;
}

// Fail CLOSED: a ledger/RLS/API error on the cap-count query must NOT open the
// cost cap. An errored count is treated as "at ceiling" so the call is blocked,
// never waved through as under-quota (Codex P2).
export function resolveCount(res: { count: number | null; error: unknown }): number {
  if (res.error) return Number.MAX_SAFE_INTEGER;
  return res.count ?? 0;
}

async function countWebCallsToday(supabaseAdmin: any, userId: string | null, now: Date): Promise<number> {
  let q = supabaseAdmin
    .from("donny_cost_ledger")
    .select("*", { count: "exact", head: true })
    .in("tier", WEB_TIERS as unknown as string[])
    .gte("created_at", startOfUtcDayIso(now));
  if (userId) q = q.eq("user_id", userId);
  const { count, error } = await q;
  if (error) console.warn("[web-tools] cap count query failed:", (error as { message?: string })?.message);
  return resolveCount({ count, error });
}

const DEFAULT_DEPS: WebToolDeps = {
  search: tavilySearch,
  extract: tavilyExtract,
  logCost: logWebToolCost,
  count: countWebCallsToday,
  now: () => new Date(),
};

// Returns a graceful {result} if the caller is over a cap, else null.
async function capGate(ctx: WebToolCtx, deps: WebToolDeps): Promise<{ result: any } | null> {
  if (ctx.internal) return null;
  const now = deps.now();
  const [userCount, globalCount] = await Promise.all([
    deps.count(ctx.supabaseAdmin, ctx.userId, now),
    // Global count intentionally spans ALL web-tier rows incl. internal Donny's — the 500/day ceiling is a platform-wide cost backstop, not consumer-only.
    deps.count(ctx.supabaseAdmin, null, now),
  ]);
  if (!isOverCap(userCount, globalCount, CAPS)) return null;
  const msg = userCount >= CAPS.perUser
    ? `You've hit today's web-search limit (${CAPS.perUser}/day). Try again tomorrow.`
    : "Web search is busy right now — please try again later.";
  return { result: { error: msg } };
}

export async function handleWebSearch(ctx: WebToolCtx, override: Partial<WebToolDeps> = {}): Promise<{ result: any }> {
  const deps = { ...DEFAULT_DEPS, ...override };
  if (!ctx.apiKey) return { result: { error: "Web access isn't configured right now." } };
  const gate = await capGate(ctx, deps);
  if (gate) return gate;
  try {
    const res = await deps.search(ctx.apiKey, String(ctx.args.query ?? ""), ctx.args.recency);
    await deps.logCost(ctx.supabaseAdmin, { userId: ctx.userId, kind: "web_search" });
    return { result: res };
  } catch (e) {
    console.warn("[web-tools] tavily web_search failed:", (e as Error)?.message);
    return { result: { error: "Web search is temporarily unavailable." } };
  }
}

export async function handleReadUrl(ctx: WebToolCtx, override: Partial<WebToolDeps> = {}): Promise<{ result: any }> {
  const deps = { ...DEFAULT_DEPS, ...override };
  if (!ctx.apiKey) return { result: { error: "Web access isn't configured right now." } };
  const gate = await capGate(ctx, deps);
  if (gate) return gate;
  try {
    const res = await deps.extract(ctx.apiKey, String(ctx.args.url ?? ""));
    await deps.logCost(ctx.supabaseAdmin, { userId: ctx.userId, kind: "web_extract" });
    return { result: res };
  } catch (e) {
    console.warn("[web-tools] tavily read_url failed:", (e as Error)?.message);
    return { result: { error: "Couldn't read that page right now." } };
  }
}
