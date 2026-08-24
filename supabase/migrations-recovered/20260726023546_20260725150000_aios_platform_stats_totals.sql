-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260726023546 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- aios_platform_stats: add `*_all` (total INCL. synthetic) counts alongside the existing real
-- (synthetic-excluded) ones. PURELY ADDITIVE: every existing key + value byte-unchanged; only new
-- `*_all` siblings added. Security posture unchanged (STABLE SECURITY DEFINER, search_path=public,
-- auth.uid() + is_internal_user() guard). Read-only.
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
