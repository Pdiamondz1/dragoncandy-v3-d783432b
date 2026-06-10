-- Add average_rating + total_reviews to the DragonShare restaurant search RPC so
-- the browse cards can show a creator-facing rating. business_profiles (bp) is
-- already joined, so the columns are available directly. Changing the RETURNS
-- TABLE signature requires DROP + recreate (CREATE OR REPLACE can't change it).

DROP FUNCTION IF EXISTS public.search_restaurants(text, text, integer);

CREATE FUNCTION public.search_restaurants(
  search_term text DEFAULT ''::text,
  cuisine_filter text DEFAULT NULL::text,
  result_limit integer DEFAULT 30
)
RETURNS TABLE(
  id uuid,
  name text,
  logo_url text,
  org_type text,
  address text,
  brand_category text,
  average_rating numeric,
  total_reviews integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (o.id)
    o.id,
    bp.business_name AS name,
    COALESCE(NULLIF(bp.logo_url, ''), o.logo_url) AS logo_url,
    o.org_type,
    ou.address,
    ou.brand_category,
    bp.average_rating,
    bp.total_reviews
  FROM business_profiles bp
  JOIN org_members om ON om.user_id = bp.user_id AND om.invitation_status = 'active'
  JOIN organizations o ON o.id = om.org_id AND o.deleted_at IS NULL
  LEFT JOIN org_units ou ON ou.org_id = o.id AND ou.is_primary = true AND ou.deleted_at IS NULL
  WHERE bp.account_type = 'restaurant'
    AND (search_term = '' OR bp.business_name ILIKE '%' || search_term || '%'
         OR COALESCE(ou.address, '') ILIKE '%' || search_term || '%')
    AND (cuisine_filter IS NULL OR ou.brand_category ILIKE cuisine_filter)
  ORDER BY o.id, bp.business_name
  LIMIT result_limit;
$function$;
