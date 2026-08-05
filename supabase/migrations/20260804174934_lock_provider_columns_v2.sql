-- Lock the two provider-routing columns against client writes.
--
-- `business_outstand_accounts`'s UPDATE policy is `USING (user_id = auth.uid())`
-- with NO column restriction, so an authenticated user can rewrite any column on
-- their own row straight from the browser — including `provider` and
-- `zernio_profile_id`. Those two decide which provider the gateway talks to and
-- which Zernio tenant container it operates inside, so a user could point
-- social-proxy at another tenant's profile and then claim its accounts.
--
-- social-proxy no longer trusts either column for authorization (it re-derives
-- the profile from the provider by name on every connect-flow op), so this is
-- defence in depth rather than the only control. Both are worth having: the code
-- fix stops the attack, this stops the column being corrupted at all.
--
-- NOTE ON MECHANISM: a bare `REVOKE UPDATE (provider, zernio_profile_id)` does
-- NOTHING here — a table-wide `GRANT UPDATE` already covers every column, and a
-- column-level revoke cannot subtract from a table-level grant. The only way to
-- restrict to a column subset is to drop the table-wide grant and re-grant the
-- exact columns. Verify with information_schema.column_privileges after applying;
-- an ineffective lock is worse than none, because it reads as protection.
--
-- The re-granted set is the COMPLETE client write surface for this table:
--   org_unit_id -> src/hooks/outstand/useAssignAccountLocation.ts
--   status      -> src/components/outstand/ConnectedAccountsList.tsx (revoke)
-- Every other write path (social-proxy, outstand-proxy, outstand-webhook,
-- zernio-webhook) uses the service-role key, which bypasses column grants
-- entirely. `anon` is granted nothing: there is no anon UPDATE policy, so RLS
-- already blocks it and the grant was meaningless.
REVOKE UPDATE ON public.business_outstand_accounts FROM anon, authenticated;

GRANT UPDATE (org_unit_id, status)
  ON public.business_outstand_accounts
  TO authenticated;
