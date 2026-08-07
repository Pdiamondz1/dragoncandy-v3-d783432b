// supabase/functions/dre-award-engine/index.ts
// Cron-invoked idempotent Dragon Points awarder. Anti-join -> award -> recompute
// balance+tier -> coalesced forward-only bell. Mirrors expire-social-hooks auth.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { isAuthorizedIngest } from '../_shared/ingest-auth.ts';
import { computeAward, resolveTier, type TierThresholds } from '../_shared/dre-rules.ts';
import { buildAwardNotification } from '../_shared/dre-notification.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });
  try {
    if (!isAuthorizedIngest(req)) return json(req, 401, { error: 'Unauthorized' });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Config
    const { data: cfgRows, error: cfgErr } = await supabase
      .from('dre_config').select('config_key, config_value');
    if (cfgErr) throw cfgErr;
    const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.config_key, r.config_value]));
    const pointValues = (cfg.point_values ?? {}) as Record<string, number>;
    const tierThresholds = (cfg.tier_thresholds ?? { creator: [], business: [] }) as TierThresholds;
    const goLiveAt = new Date(typeof cfg.go_live_at === 'string' ? cfg.go_live_at : '1970-01-01T00:00:00Z').getTime();

    // 2. Collect
    const { data: pending, error: pendErr } = await supabase.rpc('dre_pending_events');
    if (pendErr) throw pendErr;
    const rows = (pending ?? [])
      .map((p: Record<string, unknown>) => ({
        user_id: p.user_id as string,
        event_type: p.event_type as string,
        points_awarded: computeAward(p.event_type as string, pointValues),
        multiplier_applied: 1.0,
        source_id: p.source_id as string,
        occurred_at: p.occurred_at as string,
      }))
      // occurred_at is NOT NULL in the ledger; drop any row whose source timestamp
      // resolved null so one bad row can't abort the whole batch insert.
      .filter((r) => r.points_awarded > 0 && r.occurred_at);
    if (rows.length === 0) return json(req, 200, { ok: true, awarded: 0, users_updated: 0 });

    // 3. Idempotent insert; with ignoreDuplicates, .select() returns only NEW rows
    const { data: inserted, error: insErr } = await supabase
      .from('dragon_point_events')
      .upsert(rows, { onConflict: 'user_id,event_type,source_id', ignoreDuplicates: true })
      .select('user_id, event_type, points_awarded, occurred_at');
    if (insErr) throw insErr;
    const newRows = inserted ?? [];
    const affected = [...new Set(newRows.map((r) => r.user_id))];
    if (affected.length === 0) return json(req, 200, { ok: true, awarded: 0, users_updated: 0 });

    // 4. Prior tiers (to flag tier-ups in the bell)
    const { data: prior, error: priorErr } = await supabase
      .from('dragon_point_balances').select('user_id, tier').in('user_id', affected);
    if (priorErr) console.warn('dre-award-engine: prior-tier fetch failed:', priorErr.message);
    const priorTier = new Map((prior ?? []).map((b) => [b.user_id, b.tier]));

    // 5. Recompute balance + tier
    const { data: aggs, error: aggErr } = await supabase
      .rpc('dre_user_aggregates', { p_user_ids: affected });
    if (aggErr) throw aggErr;
    const newTier = new Map<string, string>();
    for (const a of aggs ?? []) {
      const tier = resolveTier(a.role, {
        balance: a.balance ?? 0,
        campaignsCompleted: a.campaigns_completed ?? 0,
        avgRating: a.avg_rating,
      }, tierThresholds);
      newTier.set(a.user_id, tier);
      const { error: upErr } = await supabase.from('dragon_point_balances').upsert({
        user_id: a.user_id,
        total_earned: a.balance ?? 0,
        total_redeemed: 0,
        balance: a.balance ?? 0,
        tier,
        last_activity_at: a.last_activity_at,
      }, { onConflict: 'user_id' });
      if (upErr) throw upErr;
    }

    // 6. Forward-only, coalesced bell (in-app only: 'dragon_points_award' has no email map)
    let notified = 0;
    for (const uid of affected) {
      const forward = newRows.filter(
        (r) => r.user_id === uid && new Date(r.occurred_at).getTime() >= goLiveAt,
      );
      const sum = forward.reduce((s, r) => s + (r.points_awarded ?? 0), 0);
      if (sum <= 0) continue;
      const tieredUp = (priorTier.get(uid) ?? 'egg') !== newTier.get(uid);
      // Per-user bell op is its own try/catch: buildAwardNotification() and the
      // JSON.stringify() below run synchronously OUTSIDE the fetch's .catch(), so
      // without this a bad label/serialization would escape the loop, 500 the whole
      // run, and silently skip every remaining user's bell (awarding already committed
      // in steps 3+5, so that would be a pure notification loss, not a re-run).
      try {
        const { title, body } = buildAwardNotification(
          forward.map((r) => ({ eventType: r.event_type, points: r.points_awarded ?? 0 })),
          tieredUp,
        );
        await fetch(`${SUPABASE_URL}/functions/v1/create-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({
            recipientId: uid,
            type: 'dragon_points_award',
            category: 'account',
            title,
            body,
            icon: 'sparkles',
            actionUrl: '/rewards',
            data: {
              points: sum,
              tier: newTier.get(uid),
              events: forward.map((r) => ({ type: r.event_type, points: r.points_awarded ?? 0 })),
            },
          }),
        }).catch(() => { /* fire-and-forget; never block awarding on a bell */ });
        notified++;
      } catch (bellError) {
        // Never block or fail the run on a bell error; the award already landed.
        console.warn(`dre-award-engine: bell failed for user ${uid}:`, (bellError as Error).message);
      }
    }

    return json(req, 200, { ok: true, awarded: newRows.length, users_updated: affected.length, notified });
  } catch (error) {
    return json(req, 500, { error: (error as Error).message });
  }
});
