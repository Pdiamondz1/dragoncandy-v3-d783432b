-- P1 fix (Codex second review on the identity-verification branch): verify-phone's daily send
-- cap and cooldown were read-then-insert, non-atomic. `recentSentTimestamps` / `lastSentTimestamp`
-- read `phone_verification_attempts`, the caller decides in application code, and only THEN does
-- Twilio get called and a 'sent' row get inserted. N concurrent `start` requests all read the
-- same pre-limit history, all pass the check, and all send — bypassing both the daily cap and the
-- cooldown. The threat model here is SMS-pumping fraud (the table's own 20260824130000 header
-- comment names it): unbounded carrier charges, not a narrower or harder-to-exploit issue. An
-- earlier internal review raised this and it was parked as non-blocking; that was wrong — the
-- cost is financial and unbounded.
--
-- Fix: make the check-and-reserve ATOMIC in the database, BEFORE the Twilio call. Mirrors
-- record_crew_activity's fix for the identical race shape (20260710120010): a transaction-scoped
-- pg_advisory_xact_lock serializes the check-and-insert so two concurrent callers for the same key
-- cannot both observe "under the limit" — the first to acquire the lock inserts and commits (or
-- returns "declined" and inserts nothing), the second then re-counts against the row the first one
-- just wrote (or the now-later timestamp), inside the SAME lock.
--
-- Two lock keys are taken, in a FIXED order (user key first, then ip key) on every call — the
-- fixed order is what rules out a deadlock cycle when two different users happen to share an IP
-- and call concurrently. Distinct literal prefixes ('phone_verify_send:user:' /
-- 'phone_verify_send:ip:') keep a user id and an ip hash from ever colliding on the same
-- hashtext() bucket by coincidence.
--
-- Counting predicate: outcome IN ('sent', 'rejected'), never outcome = 'sent' alone. The caller
-- (verify-phone/index.ts) reserves a slot here BEFORE calling Twilio, and if Twilio itself then
-- fails, it flips that same row's outcome to 'rejected' — a plain UPDATE via its own service-role
-- client, not a second RPC call, since phone_verification_attempts already grants that client ALL
-- (pva_service_all, 20260824130000). A reserved-then-failed slot must still consume the caller's
-- quota (fail CLOSED toward the caller's own carrier bill — the same "fail open toward the user,
-- fail closed toward the attacker" reasoning verify-phone/index.ts already documents above
-- recentSentTimestamps): if the count query only matched outcome = 'sent', re-labeling a row
-- 'rejected' would silently hand back the slot it just consumed, and repeated Twilio failures
-- (real or attacker-induced, e.g. a bad number chosen to make Twilio 4xx) would never throttle.
-- 'throttled' and 'blocked_country' rows are deliberately excluded from the count — those attempts
-- never reserved a slot in the first place ('blocked_country' is decided before this function is
-- ever called, and 'throttled' rows are never inserted by this function at all — see the decline
-- branches below, which return without writing anything).
--
-- service_role only, matching every other write path on this table.

create or replace function public.reserve_phone_verification_send(
  p_user_id uuid,
  p_ip_hash text,
  p_limit int,
  p_window_seconds int,
  p_cooldown_seconds int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start   timestamptz := now() - make_interval(secs => p_window_seconds);
  v_cooldown_start timestamptz := now() - make_interval(secs => p_cooldown_seconds);
  v_user_count     int;
  v_ip_count       int;
  v_last_sent      timestamptz;
  v_attempt_id     uuid;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'reserve_phone_verification_send: service_role only';
  end if;
  if p_user_id is null then
    raise exception 'reserve_phone_verification_send: p_user_id is required';
  end if;
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'reserve_phone_verification_send: p_limit and p_window_seconds must be positive';
  end if;

  -- Fixed lock order (user, then ip) on every call — see header note on deadlock avoidance.
  perform pg_advisory_xact_lock(hashtext('phone_verify_send:user:' || p_user_id::text));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtext('phone_verify_send:ip:' || p_ip_hash));
  end if;

  select count(*) into v_user_count
    from phone_verification_attempts
    where user_id = p_user_id
      and action = 'start'
      and outcome in ('sent', 'rejected')
      and created_at >= v_window_start;

  if p_ip_hash is not null then
    select count(*) into v_ip_count
      from phone_verification_attempts
      where ip_hash = p_ip_hash
        and action = 'start'
        and outcome in ('sent', 'rejected')
        and created_at >= v_window_start;
  else
    v_ip_count := 0;
  end if;

  if v_user_count >= p_limit or v_ip_count >= p_limit then
    return jsonb_build_object('reserved', false, 'reason', 'limit');
  end if;

  if p_cooldown_seconds > 0 then
    select created_at into v_last_sent
      from phone_verification_attempts
      where user_id = p_user_id
        and action = 'start'
        and outcome in ('sent', 'rejected')
      order by created_at desc
      limit 1;

    if v_last_sent is not null and v_last_sent > v_cooldown_start then
      return jsonb_build_object('reserved', false, 'reason', 'cooldown');
    end if;
  end if;

  insert into phone_verification_attempts (user_id, ip_hash, action, outcome)
  values (p_user_id, p_ip_hash, 'start', 'sent')
  returning id into v_attempt_id;

  return jsonb_build_object('reserved', true, 'reason', 'ok', 'attempt_id', v_attempt_id);
end;
$$;

revoke execute on function public.reserve_phone_verification_send(uuid, text, int, int, int)
  from public, anon, authenticated;
grant execute on function public.reserve_phone_verification_send(uuid, text, int, int, int)
  to service_role;
