-- A reused idempotency key carrying a DIFFERENT post is a conflict, not a replay.
--
-- ===========================================================================
-- WHAT CODEX FOUND
-- ===========================================================================
--
-- `20260826380000` made the key a pure lookup: same key, same job, reported as
-- a successful deduplication. That is right for a retry and wrong for a client
-- bug. A caller that reuses a key for a genuinely different approval -- a key
-- held in a component that did not reset, a key derived from something less
-- unique than it looked -- is told `enqueued: true` with a job id, and the post
-- they actually asked for SILENTLY NEVER HAPPENS.
--
-- That is the worst failure shape in this whole feature. Every other refusal
-- here says what is wrong; this one reports success for work it discarded.
--
-- It is also the standard semantic everywhere idempotency keys are done
-- properly: a key is a promise about ONE request, and presenting it with a
-- different body is an error rather than a match.
--
-- ===========================================================================
-- FINGERPRINTING THE REQUEST, NOT RE-READING THE ROW
-- ===========================================================================
--
-- Comparing against the stored job's columns was the cheaper-looking option and
-- does not work: `scheduled_at` is stored as `coalesce(p_scheduled_at, now())`,
-- so a retry that passes null -- the ordinary "post now" case -- would compare
-- its own null against a timestamp and report a conflict on every single retry.
-- The digest is taken over the RAW inputs, before any coalescing, which is the
-- only version of the request that is stable across attempts.
--
-- `jsonb_build_object(...)::text` rather than a hand-built concatenation,
-- because jsonb normalises key order, so the digest cannot change from an
-- editing accident. `md5` rather than a cryptographic digest on purpose: this
-- detects an accident, it does not defend against a forged one. A caller who
-- wanted to collide with their OWN key could simply reuse it -- the key is
-- already scoped per user, so there is no one else's post to reach.
--
-- A row whose fingerprint is NULL is treated as a match. Nothing has ever
-- written one (the table is empty), but if such a row existed we could not
-- prove a conflict, and refusing on an unprovable conflict would break the
-- legitimate retry this whole mechanism exists to serve.

alter table public.publish_jobs
  add column if not exists request_fingerprint text;

comment on column public.publish_jobs.request_fingerprint is
  'md5 over the RAW enqueue inputs (pre-coalesce). Lets a replay be told apart from a key reused for a different post. Never a security boundary — the key is already scoped per user.';

drop function if exists public.enqueue_publish_job(text, text, text[], text, timestamptz, text, uuid, text);

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

  -- Over the RAW arguments. `p_scheduled_at` in particular must NOT be
  -- coalesced here -- see the header.
  v_fingerprint := md5(jsonb_build_object(
    'platform',     p_platform,
    'content_type', p_content_type,
    'media',        to_jsonb(coalesce(p_media_paths, '{}')),
    'scheduled_at', p_scheduled_at,
    'caption',      p_caption,
    'schedule_id',  p_source_schedule_id,
    'account_key',  p_account_key
  )::text);

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

revoke execute on function public.enqueue_publish_job(text, text, text[], text, timestamptz, text, uuid, text)
  from public, anon;
grant execute on function public.enqueue_publish_job(text, text, text[], text, timestamptz, text, uuid, text)
  to authenticated, service_role;
