-- GW PR 5b: metrics → Google Sheet auto-flow.
--
-- aios_settings: service-role-only key/value store (RLS on, ZERO policies — the
-- proxy reads it server-side; no client ever needs it). Holds
-- google_export_user_id, the designated account whose Drive owns the canonical
-- "DragonCandy Metrics" sheet.
create table if not exists public.aios_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table public.aios_settings enable row level security;
-- Intentionally no policies: only the service role (the proxy) touches this.

-- aios_metrics_snapshot: a flat, STABLE metrics row for the time-series sheet.
-- Deliberately separate from aios_platform_stats (whose shape tracks the
-- dashboard and may churn) — the sheet's columns must stay fixed across weeks.
-- SECURITY DEFINER + service_role-only EXECUTE: the scheduled export path has no
-- auth.uid(), so access is controlled by the grant, not an in-body auth check.
create or replace function public.aios_metrics_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  month_start timestamptz := date_trunc('month', now());
begin
  return jsonb_build_object(
    'captured_at', to_char(now(), 'YYYY-MM-DD'),
    'users_total', (select count(*) from profiles),
    'creators', (select count(*) from profiles where role::text = 'content_creator'),
    'restaurants', (select count(*) from business_profiles where account_type = 'restaurant'),
    'brands', (select count(*) from business_profiles where account_type = 'brand'),
    'campaigns_total', (select count(*) from campaigns),
    'dragonshare_posts', (select count(*) from dragonshare_posts),
    'dragonshare_boosts', (select count(*) from dragonshare_boosts),
    'promotions_total', (select count(*) from promotions),
    'social_connections', (select count(*) from business_outstand_accounts),
    'revenue_fee_cents_total', (
      select coalesce(sum(platform_fee_cents), 0) from dragonshare_boosts
      where status in ('captured', 'transferred')
    ),
    'revenue_fee_cents_mtd', (
      select coalesce(sum(platform_fee_cents), 0) from dragonshare_boosts
      where status in ('captured', 'transferred') and boosted_at >= month_start
    )
  );
end;
$$;

revoke all on function public.aios_metrics_snapshot() from public, anon, authenticated;
grant execute on function public.aios_metrics_snapshot() to service_role;
