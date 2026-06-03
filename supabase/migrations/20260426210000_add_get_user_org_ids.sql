-- Adds get_user_org_ids(), used by org-scoped RLS policies in later migrations
-- (dragonshare, org_members RLS fixes). On prod this function was created
-- out-of-band (directly in the database) and never captured in a migration, so
-- a clean replay onto a fresh project (staging) lacked it. Definition mirrors
-- prod exactly. Depends on org_members (created by 20260426200000_team_accounts).
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select org_id from org_members
  where user_id = auth.uid()
    and invitation_status = 'active';
$function$;
