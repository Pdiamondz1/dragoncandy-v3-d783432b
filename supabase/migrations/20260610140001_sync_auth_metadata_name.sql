-- Keep auth.users.raw_user_meta_data.full_name in step with the canonical
-- display name so email greetings (e.g. like-notification likerName) never
-- show a stale name. Extends the canonical_display_names sync triggers and
-- backfills existing users from profiles.full_name (already canonical).

-- ── Creator name sync (now also updates auth metadata) ──────────────────────
CREATE OR REPLACE FUNCTION public.sync_profile_name_from_creator_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text := btrim(NEW.creator_name);
BEGIN
  IF v_name IS NULL OR v_name = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.creator_name IS NOT DISTINCT FROM NEW.creator_name THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET full_name = v_name
  WHERE id = NEW.user_id
    AND full_name IS DISTINCT FROM v_name;

  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{full_name}', to_jsonb(v_name))
  WHERE id = NEW.user_id
    AND (raw_user_meta_data->>'full_name') IS DISTINCT FROM v_name;

  RETURN NEW;
END;
$function$;

-- ── Business name sync (now also updates auth metadata) ─────────────────────
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

  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{full_name}', to_jsonb(v_name))
  WHERE id = NEW.user_id
    AND (raw_user_meta_data->>'full_name') IS DISTINCT FROM v_name;

  UPDATE public.organizations o
  SET name = v_name || '''s Workspace', updated_at = now()
  FROM public.org_members om
  WHERE om.org_id = o.id AND om.user_id = NEW.user_id AND om.role = 'owner'
    AND o.deleted_at IS NULL
    AND o.name IS DISTINCT FROM (v_name || '''s Workspace');

  RETURN NEW;
END;
$function$;

-- ── Backfill auth metadata from the canonical profile name ──────────────────
UPDATE auth.users u
SET raw_user_meta_data = jsonb_set(COALESCE(u.raw_user_meta_data, '{}'::jsonb), '{full_name}', to_jsonb(p.full_name))
FROM public.profiles p
WHERE p.id = u.id
  AND p.full_name IS NOT NULL AND btrim(p.full_name) <> ''
  AND (u.raw_user_meta_data->>'full_name') IS DISTINCT FROM p.full_name;
