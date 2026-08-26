-- ---------------------------------------------------------------------------
-- tiktok_connection_status() must return bigint counters too.
--
-- 20260826230000 widened the four counter columns and both WRITE RPCs, and
-- stopped there. `tiktok_connection_status()` declares those same four columns
-- as `integer` in its RETURNS TABLE, and an SQL function coerces its result to
-- the declared type -- so it narrows bigint back to int4 on the way out and
-- raises 22003 for exactly the values the widening existed to allow.
--
-- This is the UI-facing function. `useTikTokConnection` does `if (error) throw
-- error`, and the card renders on Creator, Business and Location settings, so a
-- single account with more than 2,147,483,647 lifetime likes would have taken
-- the card's red error branch on all three surfaces.
--
-- WIDENING A COLUMN IS NOT A LOCAL CHANGE. Every function that declares a type
-- over that column has to move with it: two write RPCs (previous migration) and
-- one read RPC (this one). Grepped the schema for the rest -- the remaining
-- `integer`s are `p_skew_seconds` and `p_claim_ttl_seconds`, which are seconds
-- and correctly small.
--
-- THE FIRST PROBE OF THIS SAID IT WAS FINE. Calling the function as the real
-- connected user returned one row with no error, because every counter on that
-- row is currently null and a null coerces to anything. The bug is invisible
-- until a value large enough to fail actually exists. Re-probed by writing
-- 12,000,000,000 into `likes_count` inside a rolled-back transaction, which
-- produced `22003 integer out of range / CONTEXT: SQL function
-- "tiktok_connection_status"`. When a probe returns clean, prove it could have
-- returned dirty -- the same rule this project wrote down after measuring the
-- wrong element for the mobile scroll bug.
--
-- DROP THEN CREATE, and here it is not optional: PostgreSQL refuses to change
-- the return type of an existing function, so `create or replace` errors rather
-- than silently making an overload. The grants go with the drop and are
-- re-issued below.
-- ---------------------------------------------------------------------------

drop function if exists public.tiktok_connection_status();

create function public.tiktok_connection_status()
returns table (
  open_id text,
  display_name text,
  username text,
  avatar_url text,
  profile_deep_link text,
  follower_count bigint,
  following_count bigint,
  likes_count bigint,
  video_count bigint,
  scopes text[],
  status text,
  last_error text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.open_id,
    c.display_name,
    c.username,
    c.avatar_url,
    c.profile_deep_link,
    c.follower_count,
    c.following_count,
    c.likes_count,
    c.video_count,
    c.scopes,
    c.status,
    c.last_error,
    c.connected_at,
    c.last_synced_at,
    c.access_token_expires_at,
    c.refresh_token_expires_at
  from public.tiktok_account_connections c
  where c.user_id = auth.uid();
$$;

-- A bare REVOKE FROM PUBLIC does not lock down a definer function against
-- Supabase's default privileges: anon must be named.
revoke execute on function public.tiktok_connection_status() from public, anon;
grant execute on function public.tiktok_connection_status() to authenticated, service_role;
