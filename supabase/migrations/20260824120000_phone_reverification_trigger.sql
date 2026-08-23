-- A verification stamp must never outlive the value it attests to.
--
-- Trigger rather than convention: `phone` is written from more than one place, and a rule
-- that lives in application code is a rule that a future writer will not know about.
-- IS DISTINCT FROM (not <>) so a NULL on either side behaves — `<>` with NULL yields NULL,
-- which is not true, so the clear would silently not fire.
--
-- CONTROLLER RULING 4 — this amends the original design's trigger body.
--
-- The straightforward body — clear phone_verified_at whenever phone changes, full stop —
-- silently breaks the feature it exists to support. The verification handler (next task)
-- writes both columns in a SINGLE statement:
--   update profiles set phone = $1, phone_verified_at = now() where id = $2
-- because writing them separately would leave a window where the phone is recorded and the
-- stamp is not. A BEFORE UPDATE trigger runs once over the composed NEW row: it sees `phone`
-- changed and nulls the stamp it was just handed in the same statement. Phone verification
-- would appear to succeed and never actually record — the user is told they are verified
-- while the column says otherwise. That is the worst failure available in this slice.
--
-- Fix: clear only when the stamp is NOT being set in the same statement — i.e. phone changed
-- AND phone_verified_at is unchanged from OLD. When a caller sets both columns together
-- (the real verification-handler shape), the second condition is false and nothing clears.
-- When a caller changes only phone (any other writer), the second condition is trivially
-- true (NEW.phone_verified_at IS NOT DISTINCT FROM OLD.phone_verified_at, since it wasn't
-- touched) and the clear fires as intended.
--
-- Also dropped SECURITY DEFINER: the function only assigns to NEW, nothing privileged
-- happens inside it, so DEFINER was an elevation with no benefit (same reasoning as
-- 20260824111000's drop on the creator/business/org_units guards). Plain invoker default,
-- search_path still pinned.

create or replace function public.clear_phone_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.phone is distinct from old.phone
     and new.phone_verified_at is not distinct from old.phone_verified_at
  then
    new.phone_verified_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_clear_phone_verification on public.profiles;
create trigger trg_clear_phone_verification
  before update of phone on public.profiles
  for each row
  execute function public.clear_phone_verification();
