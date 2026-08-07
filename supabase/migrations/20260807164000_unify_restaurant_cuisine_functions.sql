-- Unify restaurant cuisine on business_profiles.cuisines (Phase 1).
-- These two functions previously read org_units.brand_category (free text) and
-- existed only in prod (drift). Repoint them at the canonical slug array and
-- bring them under version control. Signatures/RETURNS are unchanged.

create or replace function public.list_restaurant_cuisines()
 returns table(cuisine text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select distinct c as cuisine
  from business_profiles bp
  join org_members om on om.user_id = bp.user_id and om.invitation_status = 'active'
  join organizations o on o.id = om.org_id and o.deleted_at is null
  cross join lateral unnest(bp.cuisines) as c
  where bp.account_type = 'restaurant'
    and c is not null and c <> ''
  order by cuisine;
$function$;

create or replace function public.search_restaurants(
  search_term text default ''::text,
  cuisine_filter text default null::text,
  result_limit integer default 30
)
 returns table(id uuid, name text, logo_url text, org_type text, address text, brand_category text, average_rating numeric, total_reviews integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select distinct on (o.id)
    o.id,
    bp.business_name as name,
    coalesce(nullif(bp.logo_url, ''), o.logo_url) as logo_url,
    o.org_type,
    ou.address,
    ou.brand_category,
    bp.average_rating,
    bp.total_reviews
  from business_profiles bp
  join org_members om on om.user_id = bp.user_id and om.invitation_status = 'active'
  join organizations o on o.id = om.org_id and o.deleted_at is null
  left join org_units ou on ou.org_id = o.id and ou.is_primary = true and ou.deleted_at is null
  where bp.account_type = 'restaurant'
    and (search_term = '' or bp.business_name ilike '%' || search_term || '%'
         or coalesce(ou.address, '') ilike '%' || search_term || '%')
    and (cuisine_filter is null or cuisine_filter = any(bp.cuisines))
  order by o.id, bp.business_name
  limit result_limit;
$function$;
