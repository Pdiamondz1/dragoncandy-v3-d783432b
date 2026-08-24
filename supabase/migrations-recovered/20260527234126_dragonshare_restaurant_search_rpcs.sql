-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260527234126 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.


-- search_restaurants: search by business display name + address, bypassing org RLS
CREATE OR REPLACE FUNCTION search_restaurants(
  search_term text DEFAULT '',
  cuisine_filter text DEFAULT NULL,
  result_limit int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  org_type text,
  address text,
  brand_category text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ON (o.id)
    o.id,
    bp.business_name AS name,
    COALESCE(NULLIF(bp.logo_url, ''), o.logo_url) AS logo_url,
    o.org_type,
    ou.address,
    ou.brand_category
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
$$;

-- get_restaurant_by_org_id: fetch a single restaurant by org ID for the browse return flow
CREATE OR REPLACE FUNCTION get_restaurant_by_org_id(
  target_org_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  org_type text,
  address text,
  brand_category text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ON (o.id)
    o.id,
    bp.business_name AS name,
    COALESCE(NULLIF(bp.logo_url, ''), o.logo_url) AS logo_url,
    o.org_type,
    ou.address,
    ou.brand_category
  FROM organizations o
  JOIN org_members om ON om.org_id = o.id AND om.invitation_status = 'active'
  JOIN business_profiles bp ON bp.user_id = om.user_id AND bp.account_type = 'restaurant'
  LEFT JOIN org_units ou ON ou.org_id = o.id AND ou.is_primary = true AND ou.deleted_at IS NULL
  WHERE o.id = target_org_id
    AND o.deleted_at IS NULL
  ORDER BY o.id, bp.business_name
  LIMIT 1;
$$;

-- list_restaurant_cuisines: distinct brand_category values for cuisine filter pills
CREATE OR REPLACE FUNCTION list_restaurant_cuisines()
RETURNS TABLE (
  cuisine text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ou.brand_category AS cuisine
  FROM org_units ou
  JOIN organizations o ON o.id = ou.org_id AND o.deleted_at IS NULL
  JOIN org_members om ON om.org_id = o.id AND om.invitation_status = 'active'
  JOIN business_profiles bp ON bp.user_id = om.user_id AND bp.account_type = 'restaurant'
  WHERE ou.is_primary = true
    AND ou.deleted_at IS NULL
    AND ou.brand_category IS NOT NULL
    AND ou.brand_category <> ''
  ORDER BY cuisine;
$$;
