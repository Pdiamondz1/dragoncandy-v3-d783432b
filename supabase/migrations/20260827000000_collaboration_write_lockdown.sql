-- Close the collaboration write surface: the payout marker and the revision
-- counter are server-owned, not client-supplied.
--
-- ## What was wrong
--
-- `campaign_collaborations` has ONE client UPDATE policy — "Collaboration
-- participants can update collaborations" — whose `with_check` is NULL. Postgres
-- defaults an omitted WITH CHECK to the USING expression, so the NEW row must
-- still belong to the same creator/owner; `creator_id` and `campaign_id` are
-- therefore pinned. NOTHING ELSE IS. Combined with table-wide column grants to
-- `anon` and `authenticated`, a participant could write ANY other column on their
-- own row.
--
-- Two consequences, both PROVEN on prod 2026-08-26 inside rolled-back
-- transactions, each with a control that returned zero rows for an unrelated
-- user (so the writes were refused by RLS, not by a superuser bypass):
--
--   1. THE PAYOUT MARKER IS FORGEABLE. `payout_executed_at` / `stripe_transfer_id`
--      are the durable exactly-once markers; `release-creator-payout` treats a set
--      marker as "money already moved" and short-circuits to finalize-only. A
--      campaign owner could set them with no money moving, and the collaboration
--      would be marked complete with the creator never paid. The documented
--      invariant "marker set ⇒ money moved, by construction" did not hold,
--      because construction included the client.
--
--   2. THE REVISION CAP DID NOT BIND. `enforce_revision_limit` raises when
--      OLD.revision_count >= 2, but the client supplied `revision_count` in the
--      same statement as the status change. A client that always sent 0 got
--      unlimited revisions: five full cycles ran with the trigger never firing.
--      A creator can be held in unpaid rework indefinitely.
--
-- Same defect class as `campaign_invitations` (20260808010000): an RLS WITH CHECK
-- sees only the NEW row, so "this column must not change" is inexpressible as a
-- policy, and column privileges are the correct tool. The policy is left exactly
-- as it is — it is correct about WHICH ROW; it was never the thing deciding which
-- COLUMN.
--
-- ## Why the counter moves into the trigger rather than just being revoked
--
-- Both call sites did `revision_count: (collab.revision_count ?? 0) + 1` — a
-- client-side read-modify-write. Revoking the column alone would break them.
-- Deriving it in the BEFORE trigger fixes a second latent bug for free: two
-- concurrent revision requests both read 1 and both write 2, losing one. The
-- trigger reads OLD inside the row lock, so it cannot lose an increment.

-- ── 1. The counter becomes server-owned ─────────────────────────────────────────
create or replace function public.enforce_revision_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
BEGIN
  IF NEW.content_status = 'revision_requested'
     AND (OLD.content_status IS DISTINCT FROM 'revision_requested')
  THEN
    IF COALESCE(OLD.revision_count, 0) >= 2 THEN
      RAISE EXCEPTION 'Maximum revision limit (2) reached. Content must be approved or rejected.';
    END IF;
    -- Derive it. Whatever the caller sent is discarded: this is the only writer.
    NEW.revision_count := COALESCE(OLD.revision_count, 0) + 1;
  ELSE
    -- Outside that transition the counter never moves. Belt and braces: the grant
    -- below already stops a client naming the column, but a future SECURITY
    -- DEFINER path would bypass grants and not this.
    NEW.revision_count := OLD.revision_count;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 2. Lock the write surface to what the client actually writes ────────────────
-- Enumerated from src/ quote-agnostically, not by eye: the `profiles` lockdown
-- enumerated by hand and MISSED A CALL SITE TWICE, each time surfacing as a 42501
-- the app discarded. `collaborationWriteGrants.test.ts` re-derives this list on
-- every CI run and fails if a write site appears that is not granted here.
--
-- `revision_count` is deliberately ABSENT — it is now trigger-owned (above).
-- `payout_executed_at` and `stripe_transfer_id` are deliberately ABSENT — no
-- client code writes them, so revoking costs nothing and closes defect 1.
revoke update on public.campaign_collaborations from anon, authenticated;

grant update (
  business_completion_status,
  completed_at,
  content_deadline,
  content_started_at,
  content_status,
  creator_completion_status,
  deliverables_status,
  review_status,
  revision_feedback,
  status,
  updated_at
) on public.campaign_collaborations to authenticated;

-- `anon` gets nothing back. A collaboration is never edited by a signed-out
-- caller, and the previous table-wide grant to anon was unintentional breadth.

-- ── 3. Assert the resulting grant set, with a failable check ────────────────────
-- PUBLIC is included in the filter on purpose: a table-wide `GRANT ... TO PUBLIC`
-- is recorded under that grantee, so omitting it would make this assertion
-- unfailable — the same trap 20260808010000 documents.
do $$
declare
  leaked text;
begin
  select string_agg(distinct grantee || ':' || column_name, ', ')
    into leaked
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'campaign_collaborations'
     and privilege_type = 'UPDATE'
     and grantee in ('anon', 'authenticated', 'PUBLIC')
     and column_name in (
       'payout_executed_at', 'stripe_transfer_id', 'revision_count',
       'creator_id', 'campaign_id', 'application_id',
       'dispute_outcome', 'dispute_reason', 'content_submitted_at', 'status_changed_at'
     );

  if leaked is not null then
    raise exception 'server-owned columns are still client-writable: %', leaked;
  end if;
end $$;
