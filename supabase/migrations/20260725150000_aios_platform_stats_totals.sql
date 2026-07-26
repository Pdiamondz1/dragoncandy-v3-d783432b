-- aios_platform_stats: add `*_all` (total INCL. synthetic) counts alongside the existing real
-- (synthetic-excluded) ones, so the /internal Overview can show "real / total" per card and a
-- "synthetic run active" banner (synthetic present <=> any `*_all` > its real count). PURELY ADDITIVE:
-- every existing key + its value is byte-unchanged; only new `*_all` siblings are added. Security
-- posture unchanged (STABLE SECURITY DEFINER, search_path=public, auth.uid() + is_internal_user()
-- guard). The `*_all` values are aggregate COUNTS only (no row data), internal-only via the guard.
-- create-or-replace preserves the existing grants. Read-only. Apply is founder-gated (careful).
create or replace function public.aios_platform_stats()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_internal_user() then raise exception 'forbidden: internal access required'; end if;
  return jsonb_build_object(
    'users', jsonb_build_object(
      'total',(select count(*) from profiles where not public.is_synthetic(id)),
      'total_all',(select count(*) from profiles),
      'by_role',(select coalesce(jsonb_object_agg(role,cnt),'{}'::jsonb) from (select role::text as role,count(*) as cnt from profiles where not public.is_synthetic(id) group by role) r),
      'by_role_all',(select coalesce(jsonb_object_agg(role,cnt),'{}'::jsonb) from (select role::text as role,count(*) as cnt from profiles group by role) ra)),
    'businesses', jsonb_build_object(
      'restaurants',(select count(*) from business_profiles where account_type='restaurant' and not public.is_synthetic(user_id)),
      'restaurants_all',(select count(*) from business_profiles where account_type='restaurant'),
      'brands',(select count(*) from business_profiles where account_type='brand' and not public.is_synthetic(user_id)),
      'brands_all',(select count(*) from business_profiles where account_type='brand'),
      'locations',(select count(*) from org_units where not public.is_synthetic_org(org_id)),
      'locations_all',(select count(*) from org_units)),
    'campaigns', jsonb_build_object(
      'total',(select count(*) from campaigns where not public.is_synthetic(user_id)),
      'total_all',(select count(*) from campaigns),
      'by_status',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status::text as status,count(*) as cnt from campaigns where not public.is_synthetic(user_id) group by status) c)),
    'dragonshare', jsonb_build_object(
      'posts_total',(select count(*) from dragonshare_posts where not public.is_synthetic(creator_id)),
      'posts_total_all',(select count(*) from dragonshare_posts),
      'posts_by_status',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status,count(*) as cnt from dragonshare_posts where not public.is_synthetic(creator_id) group by status) p),
      'boosts_total',(select count(*) from dragonshare_boosts b where not (public.is_synthetic(b.boosting_user_id) or public.is_synthetic_org(b.boosting_org_id) or public.is_synthetic((select dp.creator_id from dragonshare_posts dp where dp.id=b.post_id)))),
      'boosts_total_all',(select count(*) from dragonshare_boosts)),
    'promotions', jsonb_build_object(
      'total',(select count(*) from promotions where not public.is_synthetic(user_id)),
      'total_all',(select count(*) from promotions),
      'by_status',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status,count(*) as cnt from promotions where not public.is_synthetic(user_id) group by status) pr)),
    'content', jsonb_build_object(
      'social_posts_logged',(select count(*) from social_post_log where not public.is_synthetic(user_id)),
      'social_posts_logged_all',(select count(*) from social_post_log),
      'performance_tracked_posts',(select count(distinct outstand_post_id) from content_performance where not public.is_synthetic(user_id)),
      'performance_tracked_posts_all',(select count(distinct outstand_post_id) from content_performance)),
    'social_connections', jsonb_build_object(
      'total',(select count(*) from business_outstand_accounts where not public.is_synthetic(user_id)),
      'total_all',(select count(*) from business_outstand_accounts),
      'by_platform',(select coalesce(jsonb_object_agg(platform,cnt),'{}'::jsonb) from (select platform,count(*) as cnt from business_outstand_accounts where not public.is_synthetic(user_id) group by platform) bp)),
    'generated_at', now());
end; $function$;

-- ===== VERIFICATION (coordinator runs at the careful gate — NOT applied by this migration) =====
-- Rollback-free, read-only (the function writes nothing). Fake an internal caller and confirm the
-- new *_all keys are >= their real counterparts and equal them when no synthetic data exists:
--   begin;
--     select set_config('request.jwt.claim.sub', (select user_id::text from internal_users limit 1), true);
--     set local role authenticated;
--     select (aios_platform_stats()->'users'->>'total')::int      as real_users,
--            (aios_platform_stats()->'users'->>'total_all')::int   as all_users,       -- all >= real
--            (aios_platform_stats()->'campaigns'->>'total_all')::int as all_campaigns,  -- present
--            (aios_platform_stats()->'businesses'->>'locations_all')::int as all_locations;
--       -- expect all_users >= real_users (the gap = synthetic profiles), every *_all key present.
--   rollback;
