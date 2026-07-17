// supabase/functions/donny-chat/web-tools.ts
// Metering + orchestration for Donny's web tools (internal donny-chat surface).
// Impure (DB + Tavily), dependency-injected so cap/bypass/log logic is unit-tested.
// No Deno.* here — index.ts reads TAVILY_API_KEY and passes it via ctx.apiKey.

import {
  tavilySearch, tavilyExtract,
  type SearchResult, type ExtractResult,
} from "../_shared/tavily.ts";
import { logWebToolCost } from "../_shared/cost-ledger.ts";
import { CAPS, resolveCount, countWebCallsToday, overCapReason } from "../_shared/web-tools-core.ts";

// Re-export so existing importers (web-tools.test.ts) keep their surface.
export { CAPS, resolveCount };

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

const DEFAULT_DEPS: WebToolDeps = {
  search: tavilySearch,
  extract: tavilyExtract,
  logCost: logWebToolCost,
  count: countWebCallsToday,
  now: () => new Date(),
};

// Returns a graceful {result} if the caller is over a cap, else null.
async function capGate(ctx: WebToolCtx, deps: WebToolDeps): Promise<{ result: any } | null> {
  const reason = await overCapReason(
    { supabaseAdmin: ctx.supabaseAdmin, userId: ctx.userId, internal: ctx.internal },
    deps,
  );
  return reason ? { result: { error: reason } } : null;
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
