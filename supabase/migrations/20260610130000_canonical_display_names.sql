-- One canonical display name per creator and restaurant/brand across all
-- surfaces. Mirrors the sync_brand_logo_from_business_profile pattern.
--
--   creators:    creator_profiles.creator_name  -> profiles.full_name
--   businesses:  business_profiles.business_name -> owner's profiles.full_name
--                and organizations.name (kept as "<business>'s Workspace")
--   locations:   org_units.name is already the single store (no sync needed)
--
-- Triggers cover future writes; the backfills below align existing rows.

-- ── Creator name sync ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_profile_name_from_creator_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.creator_name IS NULL OR btrim(NEW.creator_name) = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.creator_name IS NOT DISTINCT FROM NEW.creator_name THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET full_name = btrim(NEW.creator_name)
  WHERE id = NEW.user_id
    AND full_name IS DISTINCT FROM btrim(NEW.creator_name);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_profile_name_from_creator ON public.creator_profiles;
CREATE TRIGGER trg_sync_profile_name_from_creator
AFTER INSERT OR UPDATE OF creator_name ON public.creator_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_name_from_creator_profile();

-- ── Business name sync ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_names_from_business_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text := btrim(NEW.business_name);
BEGIN
  IF v_name IS NULL OR v_name = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.business_name IS NOT DISTINCT FROM NEW.business_name THEN
    RETURN NEW;
  END IF;

  -- The owner appears AS the business everywhere (team members keep their own names)
  UPDATE public.profiles
  SET full_name = v_name
  WHERE id = NEW.user_id
    AND full_name IS DISTINCT FROM v_name;

  UPDATE public.organizations o
  SET name = v_name || '''s Workspace', updated_at = now()
  FROM public.org_members om
  WHERE om.org_id = o.id AND om.user_id = NEW.user_id AND om.role = 'owner'
    AND o.deleted_at IS NULL
    AND o.name IS DISTINCT FROM (v_name || '''s Workspace');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_names_from_business_profile ON public.business_profiles;
CREATE TRIGGER trg_sync_names_from_business_profile
AFTER INSERT OR UPDATE OF business_name ON public.business_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_names_from_business_profile();

-- ── Backfill existing rows ───────────────────────────────────────────────────
UPDATE public.profiles p
SET full_name = btrim(cp.creator_name)
FROM public.creator_profiles cp
WHERE cp.user_id = p.id
  AND cp.creator_name IS NOT NULL AND btrim(cp.creator_name) <> ''
  AND p.full_name IS DISTINCT FROM btrim(cp.creator_name);

UPDATE public.profiles p
SET full_name = btrim(bp.business_name)
FROM public.business_profiles bp
WHERE bp.user_id = p.id
  AND bp.business_name IS NOT NULL AND btrim(bp.business_name) <> ''
  AND p.full_name IS DISTINCT FROM btrim(bp.business_name);

UPDATE public.organizations o
SET name = btrim(bp.business_name) || '''s Workspace', updated_at = now()
FROM public.org_members om
JOIN public.business_profiles bp ON bp.user_id = om.user_id
WHERE om.org_id = o.id AND om.role = 'owner'
  AND o.deleted_at IS NULL
  AND bp.business_name IS NOT NULL AND btrim(bp.business_name) <> ''
  AND o.name IS DISTINCT FROM (btrim(bp.business_name) || '''s Workspace');
