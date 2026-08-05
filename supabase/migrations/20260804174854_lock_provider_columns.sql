-- SUPERSEDED BY 20260804174934_lock_provider_columns_v2.sql — this migration is
-- a NO-OP and is kept only because it is recorded in prod's schema_migrations.
--
-- The intent was to stop clients writing the provider-routing columns. It does
-- not work: a table-wide `GRANT UPDATE` already covers every column, and a
-- column-level REVOKE cannot subtract from a table-level grant. Applying this
-- reported success and changed nothing, which is the dangerous part — it reads
-- as protection. The v2 migration drops the table-wide grant and re-grants the
-- exact client-writable columns instead.
--
-- Lesson worth keeping: verify a grant change against
-- information_schema.column_privileges, never trust "success".
REVOKE UPDATE (provider, zernio_profile_id)
  ON public.business_outstand_accounts
  FROM anon, authenticated;
