-- verify-address had NO throttle of any kind, while its sibling verify-phone has an atomic
-- reservation RPC (20260824160000) added after a Codex P1. Same defect class, same function
-- family, closed on one side only.
--
-- WHY THIS IS NOT MERELY COSMETIC SYMMETRY. Every verify-address call is a billed Google
-- Geocoding request (~$5 per 1,000). Any authenticated user could call it in a loop: no per-user
-- cap, no burst cap, no reserving row. The remedy previously written down for this — "set a daily
-- quota cap in the Google Cloud console" — DOES NOT EXIST. Checked in the console on 2026-08-23:
-- the Geocoding API's "v3 requests per day" quota reads Unlimited and its edit control is disabled
-- with the tooltip "Quota is not adjustable", and a usage ALERT cannot be attached either
-- ("Alerts can not be generated for unlimited quotas from the table"). Google removed per-day caps
-- for Maps Platform; only a per-minute limit (3,000) remains, which bounds burst rate and not
-- daily spend. So the application layer is not the belt-and-braces option here. It is the only
-- control that exists, the only one we own, and the only one that fails for the abusing caller
-- rather than for the whole platform.
--
-- Spend is bounded TODAY only because the billing project (forward-deck-506417-g9) is still on the
-- $300 / 90-day free trial, which Google does not auto-charge past. That bound disappears the
-- moment anyone activates the account, and it is not a control anyone chose.
--
-- ---------------------------------------------------------------------------------
-- WHERE THIS DELIBERATELY DIFFERS FROM reserve_phone_verification_send, and why.
--
-- 1. NO COOLDOWN. The phone RPC has one because an SMS is expensive per message and a user
--    re-requesting a code is normal, so spacing matters more than volume. A geocode is ~1/1000th
--    the unit cost and the realistic abuse is a tight scripted loop, which a burst window bounds
--    directly. A cooldown here would mostly punish the legitimate case this function actually has
--    and phone does not: a business saving several locations in one sitting, each save firing its
--    own verification (see useUpdateOrgUnit). Volume caps, not spacing.
--
-- 2. TWO USER WINDOWS instead of one. A daily cap alone lets a loop spend the entire day's budget
--    in seconds; a burst cap alone lets a slow drip run all day. Both, or neither is worth much.
--
-- 3. THE COUNTING PREDICATE IS AN EXCLUSION, NOT AN INCLUSION — `outcome <> 'throttled'`, where
--    the phone RPC uses `outcome in ('sent','rejected')`. This is the one place the phone version
--    is worth improving on rather than copying. The two forms fail in opposite directions when
--    someone later adds an outcome and forgets this file: an inclusion list silently stops
--    counting the new outcome (under-throttles, costs money), an exclusion list counts it
--    (over-throttles, annoys a user). Fail closed toward the attacker, open toward the user — so
--    a new outcome counts by default and must be explicitly excused. 'throttled' is the only
--    outcome that provably never issued a Google request, because it is written on the path where
--    this function declined and the caller never called out.

create table if not exists public.address_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text,
  role text not null check (role in ('creator', 'business')),
  -- reserved : a slot was taken and a Google request is about to be issued
  -- answered : Google returned OK or ZERO_RESULTS (a real answer about the address)
  -- failed   : the request was issued but produced a non-answer or threw
  -- throttled: declined here; NO Google request was issued (the only non-counting outcome)
  outcome text not null check (outcome in ('reserved', 'answered', 'failed', 'throttled')),
  created_at timestamptz not null default now()
);

-- Both indexes are (key, created_at desc) because every read below is "this key, inside a
-- window" — the same shape as idx_pva_*, and for the same reason.
create index if not exists idx_ava_user_created on public.address_verification_attempts (user_id, created_at desc);
create index if not exists idx_ava_ip_created on public.address_verification_attempts (ip_hash, created_at desc);

-- No client access at all, matching phone_verification_attempts. Table-level revoke, never a
-- column-level one: a column-level REVOKE is a documented no-op against Supabase's ambient
-- table-wide GRANT, which this project has now recorded four separate times.
alter table public.address_verification_attempts enable row level security;
revoke all on public.address_verification_attempts from public, anon, authenticated;
grant all on public.address_verification_attempts to service_role;
create policy ava_service_all on public.address_verification_attempts
  for all to service_role using (true) with check (true);

-- Atomic check-and-reserve. Same shape as reserve_phone_verification_send: transaction-scoped
-- advisory locks serialize concurrent callers for the same key, so the loser re-counts against the
-- winner's row under a fresh READ COMMITTED snapshot rather than against the same pre-limit
-- history. Without this the count and the INSERT are a check-then-act race and N concurrent
-- requests all pass.
--
-- Lock order is FIXED (user, then ip) on every call, so two different users sharing one IP form a
-- queue rather than a deadlock cycle. hashtext() is 32-bit so key collisions exist by pigeonhole;
-- they cost needless serialization, never correctness, and a same-transaction collision between
-- this call's own two keys is re-entrant (advisory locks stack within a transaction). Do not write
-- "cannot collide" here — an earlier revision of the phone migration did and it was false.
create or replace function public.reserve_address_verification(
  p_user_id uuid,
  p_ip_hash text,
  p_role text,
  p_user_limit int,
  p_user_window_seconds int,
  p_burst_limit int,
  p_burst_window_seconds int,
  p_ip_limit int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_window_start  timestamptz := now() - make_interval(secs => p_user_window_seconds);
  v_burst_window_start timestamptz := now() - make_interval(secs => p_burst_window_seconds);
  v_user_count         int;
  v_burst_count        int;
  v_ip_count           int;
  v_attempt_id         uuid;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'reserve_address_verification: service_role only';
  end if;
  if p_user_id is null then
    raise exception 'reserve_address_verification: p_user_id is required';
  end if;
  if p_role is null or p_role not in ('creator', 'business') then
    raise exception 'reserve_address_verification: p_role must be creator or business';
  end if;
  -- Positive-value guards, so a caller passing 0 or a negative cannot silently disable a
  -- dimension. A misconfigured limit must fail loudly, not open.
  if p_user_limit <= 0 or p_user_window_seconds <= 0
     or p_burst_limit <= 0 or p_burst_window_seconds <= 0
     or p_ip_limit <= 0 then
    raise exception 'reserve_address_verification: all limits and windows must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtext('address_verify:user:' || p_user_id::text));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtext('address_verify:ip:' || p_ip_hash));
  end if;

  select count(*) into v_user_count
    from address_verification_attempts
    where user_id = p_user_id
      and outcome <> 'throttled'
      and created_at >= v_user_window_start;

  if v_user_count >= p_user_limit then
    return jsonb_build_object('reserved', false, 'reason', 'user_daily');
  end if;

  select count(*) into v_burst_count
    from address_verification_attempts
    where user_id = p_user_id
      and outcome <> 'throttled'
      and created_at >= v_burst_window_start;

  if v_burst_count >= p_burst_limit then
    return jsonb_build_object('reserved', false, 'reason', 'user_burst');
  end if;

  -- The IP dimension catches one actor spread across several accounts, which the per-user caps
  -- structurally cannot. A null ip_hash skips it rather than counting every null-IP row together
  -- as one bucket — which would throttle unrelated callers against each other. verify-address
  -- refuses to run at all when the salt is missing, so a null here means "no client IP header",
  -- not "hashing is off".
  if p_ip_hash is not null then
    select count(*) into v_ip_count
      from address_verification_attempts
      where ip_hash = p_ip_hash
        and outcome <> 'throttled'
        and created_at >= v_user_window_start;

    if v_ip_count >= p_ip_limit then
      return jsonb_build_object('reserved', false, 'reason', 'ip_daily');
    end if;
  end if;

  -- Reserved BEFORE the caller issues the Google request, so a slot is taken first and spent
  -- second. If the request then fails, the caller flips this row to 'failed' — which still counts
  -- (see the header's note 3), so induced failures cannot be used to avoid the cap.
  insert into address_verification_attempts (user_id, ip_hash, role, outcome)
  values (p_user_id, p_ip_hash, p_role, 'reserved')
  returning id into v_attempt_id;

  return jsonb_build_object('reserved', true, 'reason', 'ok', 'attempt_id', v_attempt_id);
end;
$$;

revoke execute on function public.reserve_address_verification(uuid, text, text, int, int, int, int, int)
  from public, anon, authenticated;
grant execute on function public.reserve_address_verification(uuid, text, text, int, int, int, int, int)
  to service_role;
