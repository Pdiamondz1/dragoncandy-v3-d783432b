-- A crew campaign must never become a public one.
--
-- That is not a preference, it is a promise already made in writing: the crew-invitation
-- email and two help-centre articles tell creators a crew collab is seen only by the crew.
-- Nothing in the database held anyone to it.
--
-- The gap is in this function's own first line. 20260709120014 guards the case where
-- group_id is SET to a crew the campaign owner does not own, and its header records the
-- reasoning for the other branch: "No-op for public campaigns (group_id IS NULL)." True of
-- a campaign that was always public — but the same `IF NEW.group_id IS NOT NULL` also waves
-- through the transition FROM a crew TO public, which is the promise-breaking direction.
--
-- Reachable by the campaign's own owner, not just an admin. The campaigns UPDATE policy is
-- `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())` with no column pinning,
-- so a single PATCH of {"group_id": null} moved a crew-only collab into the public
-- marketplace, where usePublicCampaigns (`.is('group_id', null)`) then lists it to everyone.
--
-- Nothing legitimate is being taken away. group_id is written on INSERT only —
-- useCampaignCreator.ts:491 (publish) and :615 (draft). No client mutation and no edge
-- function updates it, and the edit page shows crew status as a read-only panel with no
-- switcher. Duplication INSERTs a new row rather than moving an existing one.
--
-- Reassigning one crew to another (A -> B) is deliberately still allowed: the ownership
-- check above already forces B to belong to the same owner, so the campaign stays crew-only
-- and the promise holds. Only the unset is blocked here.
--
-- Enforced in a trigger rather than a CHECK constraint because a CHECK cannot see OLD, and
-- in this trigger rather than a new one so that the next reader of campaign group_id
-- enforcement finds both halves of the rule in one place. Like the ownership check it binds
-- every write path including service-role, which is the point.
CREATE OR REPLACE FUNCTION public.enforce_campaign_group_ownership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.group_id IS NOT NULL
     AND NOT public.is_creator_group_owner(NEW.group_id, NEW.user_id) THEN
    RAISE EXCEPTION 'Campaign group_id must reference a crew owned by the campaign owner'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.group_id IS NOT NULL AND NEW.group_id IS NULL THEN
    RAISE EXCEPTION 'A crew campaign cannot be made public: campaigns.group_id may not be unset'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Says `public` because 20260709120014's version did not, and so did not do what it read as.
-- CREATE OR REPLACE preserves owner and ACL, so this REVOKE is the only line that can move
-- the grant. Measured on prod before changing it: proacl was
-- {=X/postgres,postgres=X/postgres,service_role=X/postgres}, and that leading `=X` is the
-- EXECUTE-to-PUBLIC grant every function is created with. Revoking from anon and
-- authenticated never touched it, so both kept EXECUTE through PUBLIC --
-- has_function_privilege('anon', ..., 'EXECUTE') returned true. Adding `public` drops the
-- ACL to {postgres,service_role}, which is what the line always claimed.
--
-- Not a live exposure in either state: the function RETURNS trigger, so a direct call is
-- refused ("trigger functions can only be called as triggers") and PostgREST does not expose
-- trigger-returning functions. Corrected because the statement should be true, not because
-- anything was reachable.
--
-- Verified this does not break enforcement: with the PUBLIC grant dropped, an INSERT run as
-- role `authenticated` still fired the trigger and still raised. EXECUTE is checked when the
-- trigger is created, not each time it fires.
REVOKE EXECUTE ON FUNCTION public.enforce_campaign_group_ownership() FROM public, anon, authenticated;

-- Re-issued rather than assumed. The branch above enforces nothing unless this trigger
-- exists, and resting that on "20260709120014 applied" is repo intent rather than database
-- state -- a distinction this repo has been bitten by, having found migrations recorded as
-- applied but absent from prod. Confirmed present on prod today via pg_trigger; re-issuing
-- keeps it true for a fresh or drifted database as well. Identical to the original
-- declaration: BEFORE INSERT OR UPDATE OF group_id fires whenever group_id appears in an
-- UPDATE's SET list, which is exactly the reach the new branch needs.
DROP TRIGGER IF EXISTS trg_enforce_campaign_group_ownership ON public.campaigns;
CREATE TRIGGER trg_enforce_campaign_group_ownership
  BEFORE INSERT OR UPDATE OF group_id ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_group_ownership();
