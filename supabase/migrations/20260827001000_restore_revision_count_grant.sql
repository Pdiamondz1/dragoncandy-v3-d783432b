-- Restore the `revision_count` UPDATE grant. This is a fix for a break I caused.
--
-- ## What happened
--
-- 20260827000000 revoked UPDATE table-wide and granted back only the columns the
-- NEW frontend writes. But the frontend deployed on prod still sends
-- `revision_count`, and naming a revoked column is a hard **42501**, not a silent
-- drop — so every revision request on prod failed from the moment that migration
-- applied until the matching code deploys.
--
-- The ordering rule was already written down in this repo. `DATABASE_SCHEMA.md`
-- records it for `20260824140000`: a migration that is backward-INCOMPATIBLE with
-- the frontend running at merge time must apply only AFTER the deploy — the
-- reverse of the usual migration-before-code order. I applied first and deployed
-- second, which is exactly the case that rule exists for.
--
-- ## Why re-granting does NOT re-open the bypass
--
-- The bypass was never about the grant. It was that `enforce_revision_limit`
-- READ a number the client chose. The rewritten trigger now assigns
-- `NEW.revision_count` in **both** branches — deriving `OLD + 1` on a transition
-- into `revision_requested`, and pinning it to `OLD` otherwise — so whatever a
-- caller sends is discarded before the row is written. The column is inert to the
-- client whether or not it is granted.
--
-- That makes this the right fix rather than a rollback: the security property is
-- held by the trigger, which is where it belongs, and the grant is once again just
-- a compatibility surface. Removing `revision_count` from the client remains
-- correct — it stops sending a value that does nothing — but it is now cosmetic
-- cleanup rather than a hard dependency, so the code and the schema can deploy in
-- either order.
--
-- `payout_executed_at` and `stripe_transfer_id` are deliberately NOT restored. No
-- client code has ever written them, so revoking those broke nothing, and they are
-- the columns that made a forged payout possible.

grant update (revision_count) on public.campaign_collaborations to authenticated;

-- Assert the two forgeable money columns stayed revoked. Written as an exclusion
-- rather than an inclusion so that restoring a THIRD column by mistake in future
-- still trips this, instead of passing because it was not on a list.
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
     and column_name in ('payout_executed_at', 'stripe_transfer_id',
                         'creator_id', 'campaign_id', 'content_submitted_at');

  if leaked is not null then
    raise exception 'money/identity columns are client-writable again: %', leaked;
  end if;
end $$;
