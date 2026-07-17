// Shared web-tool cap logic for BOTH Donny surfaces (donny-chat internal +
// donny-orchestrator consumer). Deno-free + dependency-injected so Vitest loads it.
import { isOverCap, startOfUtcDayIso, WEB_TIERS } from "./tavily.ts";

export const CAPS = { perUser: 10, global: 500 };

// Fail CLOSED: a ledger/RLS/API error on the cap-count query must NOT open the
// cost cap. An errored count is treated as "at ceiling" so the call is blocked.
export function resolveCount(res: { count: number | null; error: unknown }): number {
  if (res.error) return Number.MAX_SAFE_INTEGER;
  return res.count ?? 0;
}

export async function countWebCallsToday(supabaseAdmin: any, userId: string | null, now: Date): Promise<number> {
  let q = supabaseAdmin
    .from("donny_cost_ledger")
    .select("*", { count: "exact", head: true })
    .in("tier", WEB_TIERS as unknown as string[])
    .gte("created_at", startOfUtcDayIso(now));
  if (userId) q = q.eq("user_id", userId);
  const { count, error } = await q;
  if (error) console.warn("[web-tools-core] cap count query failed:", (error as { message?: string })?.message);
  return resolveCount({ count, error });
}

export interface CapDeps {
  count: (supabaseAdmin: any, userId: string | null, now: Date) => Promise<number>;
  now: () => Date;
}

// Surface-agnostic cap decision. Returns a reason string if over-cap, else null.
// internal=true bypasses. The global count intentionally spans ALL web-tier rows
// (both surfaces) — the 500/day ceiling is a platform-wide Tavily-cost backstop.
export async function overCapReason(
  args: { supabaseAdmin: any; userId: string; internal: boolean },
  deps: CapDeps,
): Promise<string | null> {
  if (args.internal) return null;
  const now = deps.now();
  const [userCount, globalCount] = await Promise.all([
    deps.count(args.supabaseAdmin, args.userId, now),
    deps.count(args.supabaseAdmin, null, now),
  ]);
  if (!isOverCap(userCount, globalCount, CAPS)) return null;
  return userCount >= CAPS.perUser
    ? `You've hit today's web-search limit (${CAPS.perUser}/day). Try again tomorrow.`
    : "Web search is busy right now — please try again later.";
}
