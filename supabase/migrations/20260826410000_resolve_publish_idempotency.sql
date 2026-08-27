-- A replay must be recognised BEFORE the media is staged.
--
-- ===========================================================================
-- WHAT CODEX FOUND
-- ===========================================================================
--
-- The documented recovery from a lost enqueue response is "retry with the same
-- key". The edge function stages the media and THEN calls the RPC, so the retry
-- re-probes and re-copies the source before anything can tell it the job
-- already exists. If the source file has since been deleted, moved or had its
-- permissions changed, the retry answers `media_not_found` -- while the
-- original job sits queued and publishes on schedule.
--
-- The user is told their post failed, and then it appears. That is the same
-- class of lie as `enqueue_failed` was before 20260826380000: an answer stated
-- with confidence about something the code did not check.
--
-- It is also pure waste on the ordinary retry, which copies the media a second
-- time only to discard it the moment the RPC says `deduplicated`.
--
-- ===========================================================================
-- A FAST PATH, NOT A SECOND SOURCE OF TRUTH
-- ===========================================================================
--
-- `resolve_publish_idempotency` answers "is this key already spent, and is this
-- the same request" before the caller stages anything. It is deliberately NOT
-- the gate: `enqueue_publish_job` still runs both checks itself, and the
-- referee for two concurrent attempts is still the unique index. Two callers
-- can pass this lookup at the same instant and one of them will still lose at
-- the constraint -- which is correct, and is why the lookup is allowed to be a
-- plain read with no lock.
--
-- ===========================================================================
-- THE DIGEST BECOMES A FUNCTION, AND STOPS DEPENDING ON THE SESSION TIMEZONE
-- ===========================================================================
--
-- Two callers of one digest is exactly the drift #540 recorded, so there is now
-- one definition -- `publish_request_fingerprint` -- and both call it.
--
-- Writing it down separately also surfaced a latent bug in the inline version.
-- It rendered `p_scheduled_at` through `jsonb_build_object`, and the text form
-- of a `timestamptz` depends on the session's `TimeZone` setting. Two requests
-- carrying the identical instant would digest DIFFERENTLY if the sessions
-- disagreed about their timezone -- reporting a conflict for a genuine replay,
-- intermittently, in a way no test that pins the timezone would ever show. The
-- digest now uses `extract(epoch from ...)`, which is a number and has no such
-- rendering. Free to change today: `publish_jobs` holds no rows, so no stored
-- fingerprint has to survive it.

-- ---------------------------------------------------------------------------
-- The digest, once.
-- ---------------------------------------------------------------------------
create or replace function public.publish_request_fingerprint(
  p_platform text,
  p_content_type text,
  p_media_sources text[],
  p_scheduled_at timestamptz,
  p_caption text,
  p_source_schedule_id uuid,
  p_account_key text
)
returns text
language sql
stable
set search_path = public
as $$
  select md5(jsonb_build_object(
    'platform',     p_platform,
    'content_type', p_content_type,
    -- SOURCES, never the staged destinations: those carry a fresh random batch
    -- id on every invocation, so digesting them makes every retry look like a
    -- different post (20260826400000).
    'media',        to_jsonb(p_media_sources),
    -- Epoch, not the timestamp's text form, which depends on the session
    -- timezone. See the header.
    'scheduled_at', extract(epoch from p_scheduled_at),
    'caption',      p_caption,
    'schedule_id',  p_source_schedule_id,
    'account_key',  p_account_key
  )::text);
$$;

-- ---------------------------------------------------------------------------
-- The fast path.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_publish_idempotency(
  p_idempotency_key text,
  p_platform text,
  p_content_type text,
  p_media_sources text[],
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
  v_existing record;
  v_fingerprint text;
begin
  if v_user is null then
    return jsonb_build_object('found', false, 'reason', 'authentication required');
  end if;

  -- Scoped to the caller's own rows, and taking no user id, so this cannot be
  -- pointed at anyone else's queue. A key is only unique per user, so without
  -- that scoping this would be an oracle for other people's posts.
  select id, request_fingerprint into v_existing
  from public.publish_jobs
  where user_id = v_user and idempotency_key = p_idempotency_key;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  v_fingerprint := public.publish_request_fingerprint(
    p_platform, p_content_type, p_media_sources,
    p_scheduled_at, p_caption, p_source_schedule_id, p_account_key);

  if v_existing.request_fingerprint is not null
     and v_existing.request_fingerprint <> v_fingerprint then
    -- Reported WITHOUT the other job's id. A conflict means this request was
    -- not queued, and handing back somebody else's -- even the same user's --
    -- job id invites a caller to treat it as their own.
    return jsonb_build_object('found', false, 'conflict', true,
      'reason', 'that idempotency key was already used for a different post — use a new one');
  end if;

  return jsonb_build_object('found', true, 'job_id', v_existing.id);
end;
$$;

revoke execute on function public.resolve_publish_idempotency(text, text, text, text[], timestamptz, text, uuid, text)
  from public, anon;
grant execute on function public.resolve_publish_idempotency(text, text, text, text[], timestamptz, text, uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- And the enqueue RPC stops carrying its own copy of the digest.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_publish_job(
  p_platform text,
  p_content_type text,
  p_media_paths text[],
  p_media_sources text[],
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
  v_fingerprint text;
  v_existing record;
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

  -- Never null, even for a post with no media -- an empty array says "no media"
  -- where null would say "the caller forgot", and those must not look alike in
  -- a digest. A length mismatch is a caller bug rather than a user error, and
  -- is refused rather than digested.
  if p_media_sources is null then
    return jsonb_build_object('enqueued', false,
      'reason', 'p_media_sources is required (pass an empty array for a post with no media)');
  end if;
  if coalesce(array_length(p_media_sources, 1), 0)
     <> coalesce(array_length(p_media_paths, 1), 0) then
    return jsonb_build_object('enqueued', false,
      'reason', 'p_media_sources must have one entry per media path');
  end if;

  -- ONE definition of the digest, called from here and from
  -- `resolve_publish_idempotency`. Two copies would drift, and a drift here
  -- means the fast path and the authoritative path disagree about whether a
  -- request is a replay -- which is worse than having no fast path at all.
  v_fingerprint := public.publish_request_fingerprint(
    p_platform, p_content_type, p_media_sources,
    p_scheduled_at, p_caption, p_source_schedule_id, p_account_key);

  -- THE REPLAY CHECK, FIRST. Before any validation, because a retry of a job
  -- that already exists must answer with that job even if the request is no
  -- longer one this function would accept -- a permission revoked in the
  -- intervening seconds, say. The job is already queued; the honest answer is
  -- "yes, it is queued", not a fresh refusal.
  select id, request_fingerprint into v_existing
  from public.publish_jobs
  where user_id = v_user and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_fingerprint is not null
       and v_existing.request_fingerprint <> v_fingerprint then
      -- Reported as a REFUSAL, so the caller learns their post was not queued.
      -- Silently returning the other job is the defect this migration exists
      -- for: it reports success for work it threw away.
      return jsonb_build_object('enqueued', false,
        'reason', 'that idempotency key was already used for a different post — use a new one',
        'conflict', true);
    end if;

    return jsonb_build_object('enqueued', true, 'job_id', v_existing.id,
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
      idempotency_key, request_fingerprint
    )
    values (
      v_user, v_user, 'instagram', v_ig.id, v_ig.ig_user_id,
      p_content_type, p_caption, coalesce(p_media_paths, '{}'),
      coalesce(p_scheduled_at, now()), p_source_schedule_id,
      p_idempotency_key, v_fingerprint
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
      idempotency_key, request_fingerprint
    )
    values (
      v_user, v_user, 'facebook', v_fb.id, v_fb.page_id,
      p_content_type, p_caption, coalesce(p_media_paths, '{}'),
      coalesce(p_scheduled_at, now()), p_source_schedule_id,
      p_idempotency_key, v_fingerprint
    )
    returning id into v_job_id;
  end if;

  return jsonb_build_object('enqueued', true, 'job_id', v_job_id, 'platform', p_platform);

-- TWO CONCURRENT REQUESTS CARRYING ONE KEY. The replay check above is a read
-- followed by a write, so it is check-then-act -- the same shape that made the
-- phone throttle and the email attempt cap move into SQL. Here the referee is
-- the unique index rather than an advisory lock: whichever transaction commits
-- second raises 23505 and resolves to the winner's job. One post, no lock, and
-- no way for a future caller to skip the check, since the constraint is on the
-- table rather than in this function.
--
-- The conflict test is repeated here rather than skipped. This path is reached
-- by a genuine race, and a race between two DIFFERENT posts sharing one key is
-- exactly as wrong as the sequential case -- more so, because whichever lost is
-- the one that vanishes.
exception
  when unique_violation then
    select id, request_fingerprint into v_existing
    from public.publish_jobs
    where user_id = v_user and idempotency_key = p_idempotency_key;

    if not found then
      -- The violation was some OTHER constraint. Do not swallow it as a
      -- successful enqueue -- that would report a job id that does not exist.
      raise;
    end if;

    if v_existing.request_fingerprint is not null
       and v_existing.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('enqueued', false,
        'reason', 'that idempotency key was already used for a different post — use a new one',
        'conflict', true);
    end if;

    return jsonb_build_object('enqueued', true, 'job_id', v_existing.id,
                              'platform', p_platform, 'deduplicated', true);
end;
$$;

revoke execute on function public.enqueue_publish_job(text, text, text[], text[], text, timestamptz, text, uuid, text)
  from public, anon;
grant execute on function public.enqueue_publish_job(text, text, text[], text[], text, timestamptz, text, uuid, text)
  to authenticated, service_role;
