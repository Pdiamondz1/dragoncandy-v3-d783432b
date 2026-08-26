-- Enqueue becomes idempotent, because a lost HTTP response is not a lost post.
--
-- ===========================================================================
-- WHAT CODEX FOUND
-- ===========================================================================
--
-- `enqueue_publish_job` commits, PostgREST's response is lost to a timeout or a
-- dropped connection, and the edge function sees `rpcError`. Two things then go
-- wrong, and they are separate bugs sharing one cause:
--
--   1. The catch runs `staging.discard()`, deleting media a COMMITTED job now
--      references. The job is queued pointing at bytes that no longer exist, so
--      it burns five attempts and lands in `stuck` reporting "the staged media
--      could not be read" -- an error that blames the file for a network event.
--
--   2. The caller retries, and enqueue has no idempotency key, so the retry
--      creates a SECOND job. Both are real, both are due, and both publish.
--
-- ===========================================================================
-- WHY THE MEDIA HALF IS FIXED THE OPPOSITE WAY ROUND FROM THE OBVIOUS ONE
-- ===========================================================================
--
-- The obvious reading of (1) is that discarding is too aggressive. It is -- but
-- note what the discard was accidentally BUYING: with the media gone, the
-- orphaned job cannot publish, so it fails safe and the user's retry produces
-- exactly one post. Simply keeping the media, with no idempotency key, would
-- turn a `stuck` job into a DUPLICATE PUBLIC POST. The proposed remedy is worse
-- than the defect on the one axis this whole design exists to protect.
--
-- That accident does not cover everything, which is how you can tell it is an
-- accident rather than a design: a FACEBOOK FEED POST HAS NO MEDIA. Discarding
-- nothing protects nothing, so the orphan job publishes, the user retries, and
-- the Page carries the same text twice.
--
-- So the two halves have to move together. With the key in place, keeping the
-- media is safe: the retry resolves to the SAME job, which points at the FIRST
-- staging, and the second staging is discarded as the duplicate it is.
--
-- ===========================================================================
-- THE KEY IS REQUIRED, NOT OPTIONAL
-- ===========================================================================
--
-- A nullable key that callers may omit is a parameter nothing reads -- the
-- defect this project shipped as `p_claim_ttl_seconds` and then again nearly
-- shipped as an unpassed `p_max_age_seconds`. It also fails in the direction
-- that costs a duplicate post rather than an error.
--
-- There is no UI caller yet, which is precisely why this is the moment: adding
-- a required field to an API nobody has written against is free, and adding it
-- afterwards is a migration plus a breaking change to a shipped contract.
--
-- The key is the CLIENT's to generate, once per approval, and to reuse on every
-- retry of that approval. The server cannot mint it: each retry is a fresh
-- invocation with no memory of the last.
--
-- The unique index is scoped `(user_id, idempotency_key)`, so one user's key can
-- never collide with -- or block -- another's. A global unique index would let
-- anyone who guessed a key deny somebody else's post.

alter table public.publish_jobs
  add column if not exists idempotency_key text;

comment on column public.publish_jobs.idempotency_key is
  'Client-generated, one per approval, reused on every retry of that approval. Makes enqueue safe to repeat after an ambiguous response. Scoped per user by the unique index below.';

-- Partial, because every row predating this migration has a null key and NULLs
-- do not collide in a unique index anyway -- stating the predicate makes the
-- intent readable rather than relying on that.
create unique index if not exists publish_jobs_user_idempotency_key
  on public.publish_jobs (user_id, idempotency_key)
  where idempotency_key is not null;

drop function if exists public.enqueue_publish_job(text, text, text[], timestamptz, text, uuid, text);

create or replace function public.enqueue_publish_job(
  p_platform text,
  p_content_type text,
  p_media_paths text[],
  p_idempotency_key text,
  p_scheduled_at timestamptz default null,
  p_caption text default null,
  p_source_schedule_id uuid default null,
  p_account_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ig public.instagram_account_connections%rowtype;
  v_fb public.facebook_page_connections%rowtype;
  v_path text;
  v_job_id uuid;
  v_owns boolean;
  v_count integer := coalesce(array_length(p_media_paths, 1), 0);
begin
  if v_user is null then
    return jsonb_build_object('enqueued', false, 'reason', 'authentication required');
  end if;

  -- Bounded as well as required. `text` is unbounded, and a key is an opaque
  -- token the caller invents -- there is no reason for one to be a megabyte,
  -- and every reason not to index one.
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    return jsonb_build_object('enqueued', false,
      'reason', 'an idempotency key of at least 8 characters is required');
  end if;
  if length(p_idempotency_key) > 200 then
    return jsonb_build_object('enqueued', false, 'reason', 'idempotency key is too long');
  end if;

  -- THE REPLAY CHECK, FIRST. Before any validation, because a retry of a job
  -- that already exists must answer with that job even if the request that
  -- created it is no longer one this function would accept -- a permission
  -- revoked in the intervening seconds, say. The job is already queued; the
  -- honest answer is "yes, it is queued", not a fresh refusal.
  select id into v_job_id
  from public.publish_jobs
  where user_id = v_user and idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object('enqueued', true, 'job_id', v_job_id,
                              'platform', p_platform, 'deduplicated', true);
  end if;

  if p_platform not in ('instagram', 'facebook') then
    return jsonb_build_object('enqueued', false, 'reason', 'unsupported platform');
  end if;

  if p_content_type not in ('feed', 'reels', 'stories') then
    return jsonb_build_object('enqueued', false, 'reason', 'unsupported content_type');
  end if;

  -- Both platforms DISCARD a caption on a story rather than rejecting it, which
  -- is the quiet lie this refuses to let a user believe.
  if p_content_type = 'stories' and p_caption is not null then
    return jsonb_build_object('enqueued', false, 'reason', 'stories cannot carry a caption');
  end if;

  -- The one place the platforms genuinely differ about what a post IS: Facebook
  -- publishes text with no media, Instagram cannot.
  if v_count = 0 then
    if not (p_platform = 'facebook' and p_content_type = 'feed' and p_caption is not null) then
      return jsonb_build_object('enqueued', false, 'reason', 'no media');
    end if;
  end if;

  foreach v_path in array coalesce(p_media_paths, '{}') loop
    if v_path is null or v_path = '' then
      return jsonb_build_object('enqueued', false, 'reason', 'empty media path');
    end if;

    -- A path, never a URL. Both platforms fetch media from whatever we hand
    -- them, so a caller-supplied URL would publish arbitrary remote content
    -- under our app's credentials.
    if position('://' in v_path) > 0 or v_path like '//%' then
      return jsonb_build_object('enqueued', false, 'reason', 'media must be a storage path, not a URL');
    end if;

    -- Staged media is written as `<user-id>/<batch>/<n>`, so a path is the
    -- caller's if and only if it starts with their own `auth.uid()`. Nothing in
    -- this predicate comes from the request.
    if v_path not like v_user::text || '/%' then
      return jsonb_build_object('enqueued', false, 'reason', 'media does not belong to you');
    end if;

    if position('..' in v_path) > 0 then
      return jsonb_build_object('enqueued', false, 'reason', 'invalid media path');
    end if;
  end loop;

  -- A foreign key proves the schedule exists; only this proves it is the
  -- caller's.
  if p_source_schedule_id is not null then
    select exists (
      select 1 from public.donny_scheduled_posts
      where id = p_source_schedule_id and user_id = v_user
    ) into v_owns;

    if not v_owns then
      return jsonb_build_object('enqueued', false, 'reason', 'that schedule is not yours');
    end if;
  end if;

  if p_platform = 'instagram' then
    select * into v_ig
    from public.instagram_account_connections
    where user_id = v_user;

    if not found then
      return jsonb_build_object('enqueued', false, 'reason', 'no Instagram account connected');
    end if;
    if v_ig.status <> 'active' then
      return jsonb_build_object('enqueued', false, 'reason', 'connection is not active');
    end if;
    if not (coalesce(v_ig.permissions, '{}') @> array['instagram_business_content_publish']) then
      return jsonb_build_object('enqueued', false,
        'reason', 'this Instagram account has not granted publishing access — reconnect it and allow posting');
    end if;

    insert into public.publish_jobs (
      user_id, acting_user_id, platform, instagram_connection_id, account_key,
      content_type, caption, media_paths, scheduled_at, source_schedule_id,
      idempotency_key
    )
    values (
      v_user, v_user, 'instagram', v_ig.id, v_ig.ig_user_id,
      p_content_type, p_caption, coalesce(p_media_paths, '{}'),
      coalesce(p_scheduled_at, now()), p_source_schedule_id,
      p_idempotency_key
    )
    returning id into v_job_id;

  else
    if p_account_key is null or p_account_key = '' then
      return jsonb_build_object('enqueued', false, 'reason', 'which Page? p_account_key is required for Facebook');
    end if;

    -- Scoped by the caller's own id, so a Page id belonging to someone else
    -- does not resolve. The refusal deliberately does not distinguish "no such
    -- Page" from "not yours".
    select * into v_fb
    from public.facebook_page_connections
    where user_id = v_user and page_id = p_account_key;

    if not found then
      return jsonb_build_object('enqueued', false, 'reason', 'that Page is not connected');
    end if;
    if v_fb.status <> 'active' then
      return jsonb_build_object('enqueued', false, 'reason', 'connection is not active');
    end if;

    -- TWO gates, granted by different people and fixed different ways: the
    -- permission the user gave our app, and the task their Facebook role holds
    -- on that Page. See `_shared/facebook-publish.ts`.
    if not (coalesce(v_fb.permissions, '{}') @> array['pages_manage_posts']) then
      return jsonb_build_object('enqueued', false,
        'reason', 'this Page has not granted publishing access — reconnect it and allow posting');
    end if;
    if not (coalesce(v_fb.tasks, '{}') @> array['CREATE_CONTENT']) then
      return jsonb_build_object('enqueued', false,
        'reason', 'your Facebook role on this Page cannot create content — ask a Page admin for the Content task');
    end if;

    insert into public.publish_jobs (
      user_id, acting_user_id, platform, facebook_connection_id, account_key,
      content_type, caption, media_paths, scheduled_at, source_schedule_id,
      idempotency_key
    )
    values (
      v_user, v_user, 'facebook', v_fb.id, v_fb.page_id,
      p_content_type, p_caption, coalesce(p_media_paths, '{}'),
      coalesce(p_scheduled_at, now()), p_source_schedule_id,
      p_idempotency_key
    )
    returning id into v_job_id;
  end if;

  return jsonb_build_object('enqueued', true, 'job_id', v_job_id, 'platform', p_platform);

-- TWO CONCURRENT REQUESTS CARRYING ONE KEY. The replay check above is a read
-- followed by a write, so it is check-then-act -- the same shape that made the
-- phone throttle and the email attempt cap move into SQL. Here the fix is not
-- an advisory lock but the unique index itself, which is the strongest possible
-- referee: whichever transaction commits second raises 23505 and resolves to
-- the winner's job. One post, no lock, and no way for a future caller to skip
-- the check, since the constraint is on the table rather than in this function.
exception
  when unique_violation then
    select id into v_job_id
    from public.publish_jobs
    where user_id = v_user and idempotency_key = p_idempotency_key;

    if not found then
      -- The violation was some OTHER constraint. Do not swallow it as a
      -- successful enqueue -- that would report a job id that does not exist.
      raise;
    end if;

    return jsonb_build_object('enqueued', true, 'job_id', v_job_id,
                              'platform', p_platform, 'deduplicated', true);
end;
$$;

revoke execute on function public.enqueue_publish_job(text, text, text[], text, timestamptz, text, uuid, text)
  from public, anon;
grant execute on function public.enqueue_publish_job(text, text, text[], text, timestamptz, text, uuid, text)
  to authenticated, service_role;
