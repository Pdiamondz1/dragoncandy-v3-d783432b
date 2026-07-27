-- Scorecard settings (KV rows) + a stakeholder-safe aggregate-burn RPC.
-- The /internal/scorecard page is viewable by non-admin stakeholder-invite accounts, but the burn
-- inputs (operating_expenses, donny_cost_ledger) are admin-only. This SECURITY DEFINER RPC returns
-- ONLY the aggregate burn figure (no line items, no per-model breakdown), gated to internal users.
-- Additive + idempotent. Apply is founder-gated (careful).

-- 1. Seed the two KV settings rows (admin UPDATE policy already exists; no client INSERT policy).
insert into public.aios_dashboard_settings (key, value)
values
  ('scorecard_headline', to_jsonb('Pre-revenue by design — building the marketplace'::text)),
  ('scorecard_burn_ceiling_cents', to_jsonb(40000))   -- $400.00 default ceiling for the green signal
on conflict (key) do nothing;

-- 2. Aggregate-burn RPC — internal-gated, aggregate-only.
create or replace function public.aios_stakeholder_burn()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_month_start timestamptz := date_trunc('month', now());
  v_opex_cents bigint;
  v_ai_usd numeric;
  v_rev_cents bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_internal_user() then raise exception 'forbidden: internal access required'; end if;

  select coalesce(sum(monthly_amount_cents), 0) into v_opex_cents
    from operating_expenses where active;

  select round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4) into v_ai_usd
    from donny_cost_ledger
    where created_at >= v_month_start and is_synthetic is not true;

  -- Reuse the internal-gated revenue RPC (DragonShare MTD platform fee, synthetic-excluded).
  v_rev_cents := coalesce((public.aios_revenue_stats() -> 'dragonshare_mtd' ->> 'platform_fee_cents')::bigint, 0);

  return jsonb_build_object(
    'monthly_opex_cents', v_opex_cents,
    'mtd_ai_spend_usd', v_ai_usd,
    'mtd_revenue_cents', v_rev_cents,
    'net_burn_cents', v_opex_cents + round(v_ai_usd * 100)::bigint - v_rev_cents
  );
end;
$function$;

revoke execute on function public.aios_stakeholder_burn() from public, anon;
grant execute on function public.aios_stakeholder_burn() to authenticated;
grant execute on function public.aios_stakeholder_burn() to service_role;  -- consistency w/ sibling aios_* RPCs

-- ===== VERIFICATION (coordinator runs at the careful gate — NOT applied by this migration) =====
-- Rollback-free, read-only. Fake an internal (non-admin) caller and confirm aggregate-only output:
--   begin;
--     select set_config('request.jwt.claim.sub', (select user_id::text from user_roles where role='stakeholder' limit 1), true);
--     set local role authenticated;
--     select public.aios_stakeholder_burn();  -- returns the 4 aggregate keys, no line items
--   rollback;
