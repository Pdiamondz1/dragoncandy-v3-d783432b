-- Account completeness engine (slice 1) — additive columns only.
--
-- phone / phone_verified_at exist so the `phone_verified` requirement derives an
-- honest `unmet` rather than `unknown`. `unknown` never blocks and never renders,
-- so without the column a working engine is indistinguishable from a broken one.
-- No OTP, no capture UI, no provider in this slice — that is slice 2.
--
-- dismissed_requirements backs the dismissal of `recommended` items. It is
-- deliberately NOT the existing dismissed_coachmarks column: both are arrays of
-- opaque string keys, so sharing one means a coachmark key colliding with a
-- requirement key silently dismisses the wrong thing, with no type error.
--
-- All three are nullable with no default and no backfill: a volatile or non-null
-- default would rewrite every row, and NULL is a meaningful "never set".

alter table public.profiles
  add column if not exists phone text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists dismissed_requirements text[];

comment on column public.profiles.phone_verified_at is
  'Set at the instant phone ownership was proven. NULL = not verified. Never a boolean set optimistically.';
comment on column public.profiles.dismissed_requirements is
  'Requirement keys the user dismissed. Recommended-tier only; a required item is never dismissible.';
