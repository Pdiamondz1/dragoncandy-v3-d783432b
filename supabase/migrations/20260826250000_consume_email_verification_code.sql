-- Atomically spend one guess at an email verification code.
--
-- RENUMBERED TWICE. This began as 20260826230000, which a parallel session had already
-- recorded on prod as `tiktok_counters_bigint` (and 240000 as `tiktok_status_bigint`);
-- the sibling migration in this branch was renumbered off 20260826210000 for the same
-- reason. `supabase/migrations.test.ts` cannot catch this class: it compares versions
-- across the REPO TREE, and a file that lives only on another branch is not in the tree.
-- The ledger is the other half of the namespace, and `db:apply`'s already-recorded refusal
-- is what actually caught both. Forcing past that refusal is precisely how `recorded !=
-- actual` happens, which this project has three cases of.
--
-- WHY THIS IS SQL AND NOT TYPESCRIPT. The obvious implementation reads the row, compares
-- the code, and writes the incremented attempt count from the edge function. That is
-- check-then-act: N concurrent guesses all read the same pre-cap value, all pass the cap
-- check, and all guess — so a cap of ten buys ten-times-concurrency guesses. This project
-- shipped exactly that bug once already, in the phone-verification throttle, where it was
-- raised as a Codex P1 and moved into `reserve_phone_verification_send`. Same shape, same
-- remedy. The decision lives here, under a lock, or it is not a cap.
--
-- WHY THE BUDGET IS PER USER AND NOT PER CODE. A per-code cap has a back door: resending
-- issues a fresh row with `attempts = 0`, so an attacker loops {resend, guess ten times}
-- and the cap never binds. Summing attempts across every LIVE code the user holds closes
-- it — the budget cannot be refilled, only waited out. Nobody is ever hard-blocked by
-- this, because the emailed LINK is unaffected and keeps working the whole time; that is
-- what makes a strict cap affordable here.
--
-- THE ATTACK THE CAP EXISTS FOR is not guessing your own code — you can verify your own
-- email by clicking the link. It is signing up as `victim@example.com`, never opening the
-- inbox, and guessing. Email verification exists to prove inbox control, so guessing past
-- it defeats the entire feature. One million codes against ten guesses is one chance in a
-- hundred thousand.
--
-- ANY live code matches, not merely the newest. A user who requests a second email while
-- the first is in front of them should not be told the code they can see is wrong.

create or replace function public.consume_email_verification_code(
  p_user_id uuid,
  p_code text,
  p_max_attempts integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_already boolean;
  v_spent integer;
  v_match uuid;
  v_newest uuid;
begin
  -- Service role only. The caller is `verify-email`, which resolves p_user_id from the
  -- request's own JWT; this function must never be reachable by a client that could pass
  -- somebody else's id. Belt as well as the REVOKE below, because a future migration that
  -- re-grants EXECUTE would otherwise silently open it.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'forbidden: service role required';
  end if;

  if p_user_id is null or p_code is null or coalesce(p_max_attempts, 0) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  -- One lock per user for the whole check-and-spend. Advisory rather than row locks
  -- because the budget spans a SET of rows whose membership changes as codes are issued,
  -- and locking a moving set in a stable order is harder to get right than locking the
  -- one thing they all share.
  perform pg_advisory_xact_lock(hashtext('email_verify:' || p_user_id::text));

  select email_verified into v_already from public.profiles where id = p_user_id;

  -- Idempotent success. A double submit, or a race with the emailed link being clicked on
  -- another device, must not present the user with an error about something that already
  -- worked.
  if coalesce(v_already, false) then
    return jsonb_build_object('ok', true, 'reason', 'already_verified');
  end if;

  select coalesce(sum(coalesce(attempts, 0)), 0)::integer into v_spent
  from public.email_verification_tokens
  where user_id = p_user_id
    and verified_at is null
    and code is not null
    and expires_at > now();

  select id into v_newest
  from public.email_verification_tokens
  where user_id = p_user_id
    and verified_at is null
    and code is not null
    and expires_at > now()
  order by created_at desc
  limit 1;

  -- No live code at all is distinct from a wrong one, and the user-facing remedies differ:
  -- one needs a new email, the other needs a careful retype.
  if v_newest is null then
    return jsonb_build_object('ok', false, 'reason', 'no_live_code');
  end if;

  if v_spent >= p_max_attempts then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts', 'remaining', 0);
  end if;

  select id into v_match
  from public.email_verification_tokens
  where user_id = p_user_id
    and verified_at is null
    and code is not null
    and expires_at > now()
    and code = p_code
  order by created_at desc
  limit 1;

  if v_match is null then
    update public.email_verification_tokens
       set attempts = coalesce(attempts, 0) + 1
     where id = v_newest;
    return jsonb_build_object(
      'ok', false,
      'reason', 'mismatch',
      'remaining', greatest(p_max_attempts - (v_spent + 1), 0)
    );
  end if;

  -- Spending the code and verifying the profile are ONE transaction. In the token path
  -- beside this one they are two statements in the edge function, so a failure between
  -- them burns the credential without recording what it bought — recoverable there only
  -- because a resend mints a fresh token. Nothing here needs that escape hatch.
  update public.email_verification_tokens set verified_at = now() where id = v_match;
  update public.profiles set email_verified = true where id = p_user_id;

  return jsonb_build_object('ok', true, 'reason', 'verified');
end;
$fn$;

revoke all on function public.consume_email_verification_code(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_email_verification_code(uuid, text, integer)
  to service_role;

comment on function public.consume_email_verification_code(uuid, text, integer) is
  'Atomically spends one guess at an email verification code. Budget is per user across '
  'every live code, so resending cannot refill it. Service role only; the caller resolves '
  'p_user_id from the request JWT.';
