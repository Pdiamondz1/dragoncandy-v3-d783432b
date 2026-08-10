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

-- CREATE OR REPLACE keeps the existing ACL, so this is a restatement rather than a change.
-- Kept for parity with 20260709120014 and so a fresh database lands in the same state.
REVOKE EXECUTE ON FUNCTION public.enforce_campaign_group_ownership() FROM anon, authenticated;

-- The trigger itself is unchanged and intentionally not re-issued: 20260709120014 already
-- declares it BEFORE INSERT OR UPDATE OF group_id, which fires whenever group_id appears in
-- an UPDATE's SET list. That is exactly the reach the new branch needs.
