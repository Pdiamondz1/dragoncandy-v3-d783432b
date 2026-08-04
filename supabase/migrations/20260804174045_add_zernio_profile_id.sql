-- Zernio Profiles are the provider's multi-tenant boundary: "one profile per
-- customer, their connected accounts inside it, and your database holding the
-- mapping" (docs /guides/multi-tenant, verified live 2026-08-04 — ?profileId=
-- genuinely isolates GET /accounts, and the connect flow carries the profileId
-- through the OAuth state).
--
-- Outstand's model was flat (one org key; accounts distinguished only by id), so
-- nothing in the seam carried a tenant container. Without this column every
-- customer's accounts land in the single shared `Default` profile — workable at
-- two founder accounts, but it forfeits Zernio-side isolation and is painful to
-- retrofit at thousands of tenants.
--
-- Additive and nullable: NULL means "no Zernio profile" (every Outstand row, and
-- any Zernio row written before this column existed). Nothing reads it as
-- required; social-proxy re-derives the profile by name when it is absent.
ALTER TABLE public.business_outstand_accounts
  ADD COLUMN IF NOT EXISTS zernio_profile_id text;

COMMENT ON COLUMN public.business_outstand_accounts.zernio_profile_id IS
  'Zernio Profile id (the provider''s per-customer tenant container) this account was connected under. NULL for Outstand rows and for Zernio rows predating this column.';
