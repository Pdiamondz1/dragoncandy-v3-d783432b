-- claim_facebook_page_disconnect: re-read the target row INSIDE the lock.
--
-- Fixes a real race in `20260825150000`, found by the Codex second review while
-- reviewing the prose that claimed this function was concurrency-safe. The
-- claim was false, and in the direction that matters.
--
-- ---------------------------------------------------------------------------
-- THE BUG
--
-- The original body read the target row and THEN took the advisory lock:
--
--     select * into v_conn from facebook_page_connections
--       where user_id = ... and page_id = ...;      -- (1) UNLOCKED read
--     perform pg_advisory_xact_lock(... v_conn.fb_user_id);   -- (2) lock
--     select count(*) ... where fb_user_id = v_conn.fb_user_id;  -- (3) count
--
-- So the lock serialises the COUNT but not the row the count is about. Two
-- concurrent disconnects of the SAME Page — a double tap, or a retry after a
-- dropped response, both of which this function's own comments anticipate —
-- interleave like this, with Pages A and B on one grant:
--
--   R1  reads A            R2  reads A        (READ COMMITTED: R1 has not committed,
--                                              so R2's snapshot still contains A)
--   R1  takes the lock     R2  blocks
--   R1  counts 2 -> not last
--   R1  DELETEs A, commits, releases
--                          R2  takes the lock
--                          R2  counts 1  -> "this is the last one"
--                          R2  returns is_last=true with A's STALE token
--
-- The caller then revokes. `DELETE /me/permissions` withdraws the USER-level
-- grant, which invalidates every Page token minted from it — so **Page B dies**
-- while its row survives, showing "Connected" over a token that can no longer
-- read anything. That is exactly the outcome the lock was added to prevent; it
-- simply arrived through the door the lock did not cover.
--
-- ---------------------------------------------------------------------------
-- THE FIX
--
-- The unlocked read now retrieves ONE value — `fb_user_id`, which is only
-- needed to compute the lock key. Every decision is made from a row read AFTER
-- the lock is held. R2 above now re-reads inside the lock, finds A gone, and
-- returns `found=false`, which the caller already treats as the idempotent
-- "already gone" success it is.
--
-- The remaining edge is that the grant itself could change between the key read
-- and the lock — i.e. disconnect AND a full OAuth reconnect completing in that
-- window. Then we would hold the lock for the OLD grant while acting on a row
-- belonging to a NEW one, which is unserialised again. An advisory xact lock
-- cannot be released mid-transaction, so there is no safe way to re-lock; the
-- function raises instead. **A rare honest failure beats a silent wrong
-- answer** — and the caller maps it to a retry message rather than a 500.
--
-- Idempotent: `create or replace` only. No table, grant or policy change.
-- ---------------------------------------------------------------------------

create or replace function public.claim_facebook_page_disconnect(
  p_user_id uuid,
  p_page_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_fb_user_id text;
  v_conn public.facebook_page_connections%rowtype;
  v_remaining integer;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'claim_facebook_page_disconnect is service-role only';
  end if;

  -- Unlocked, and deliberately narrow: this read exists ONLY to derive the lock
  -- key. Nothing downstream is decided from it, so a row that changes after
  -- this point cannot mislead us.
  select fb_user_id into v_locked_fb_user_id
  from public.facebook_page_connections
  where user_id = p_user_id and page_id = p_page_id;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  -- Serialises every disconnect touching this grant.
  perform pg_advisory_xact_lock(hashtext('facebook_disconnect:' || v_locked_fb_user_id));

  -- Re-read under the lock. This is the whole fix: a concurrent disconnect that
  -- deleted this row has now committed, and we see that rather than acting on a
  -- copy it invalidated.
  select * into v_conn
  from public.facebook_page_connections
  where user_id = p_user_id and page_id = p_page_id;

  if not found then
    -- Someone else disconnected it while we waited. Already gone is the state
    -- the caller was trying to reach, so it is a success, not a failure.
    return jsonb_build_object('found', false);
  end if;

  if v_conn.fb_user_id is distinct from v_locked_fb_user_id then
    -- The row was replaced by a different grant between the key read and the
    -- lock. We hold the wrong lock and cannot swap it inside a transaction.
    raise exception 'facebook disconnect raced a reconnect for page %; retry', p_page_id
      using errcode = '40001';
  end if;

  select count(*) into v_remaining
  from public.facebook_page_connections
  where fb_user_id = v_conn.fb_user_id;

  if v_remaining <= 1 then
    -- Last Page on this grant. Leave the row in place: the caller revokes and
    -- then deletes, so a failed revoke keeps the token that can retry it.
    return jsonb_build_object(
      'found', true,
      'is_last', true,
      'id', v_conn.id,
      'user_access_token', v_conn.user_access_token,
      'user_token_expires_at', v_conn.user_token_expires_at
    );
  end if;

  -- Others remain on this grant, so there is nothing to revoke — drop just this
  -- row, inside the lock, so the count above cannot be stale for anyone else.
  delete from public.facebook_page_connections where id = v_conn.id;

  return jsonb_build_object('found', true, 'is_last', false, 'id', v_conn.id);
end;
$$;

-- Re-asserted rather than assumed: `create or replace` preserves the existing
-- ACL, but this project has recorded cases of "recorded != actual", and these
-- two lines are cheap and idempotent.
revoke execute on function public.claim_facebook_page_disconnect(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_facebook_page_disconnect(uuid, text) to service_role;
