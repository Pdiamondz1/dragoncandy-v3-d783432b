-- The fingerprint has to key on the media the user CHOSE, not on where we put it.
--
-- ===========================================================================
-- TWO FIXES THAT CANCELLED EACH OTHER OUT
-- ===========================================================================
--
-- `20260826380000` made a retry safe by keying on an idempotency key.
-- `20260826390000` made a REUSED key safe by digesting the request. Together
-- they broke the thing the first one existed for, and Codex found it:
--
--   * `plannedDestinations` mints a fresh `crypto.randomUUID()` batch directory
--     on every invocation, so the staged paths differ between an attempt and
--     its retry -- by design, so two approvals of the same file are two frozen
--     sets of bytes.
--   * The digest included those paths.
--
-- So every retry of a post WITH MEDIA produced a different digest, was reported
-- as `idempotency_key_conflict`, and the documented recovery from a lost enqueue
-- response was dead on exactly the requests it was written for. Only a Facebook
-- text post -- the one shape with no media -- still worked.
--
-- ===========================================================================
-- WHY MY OWN VERIFICATION MISSED IT, WHICH IS THE PART WORTH KEEPING
-- ===========================================================================
--
-- The prod probe for `20260826380000` passed the SAME `v_paths` array on both
-- calls, because it was testing the RPC in isolation. That is a real contract
-- and it held. It is not the contract the CLIENT sees, and the client never
-- passes the same paths twice. A probe that exercises a function directly can
-- prove the function right and the FEATURE wrong, and there is no control that
-- catches it from inside -- the fixture has to come from where the caller
-- stands. The checks added with this migration pass freshly-generated
-- destinations on the retry, the way the edge function actually does.
--
-- ===========================================================================
-- SOURCES RATHER THAN DETERMINISTIC DESTINATIONS
-- ===========================================================================
--
-- The obvious fix is to derive the staged path from the idempotency key so it
-- repeats. It goes wrong in three places at once, and the third is destructive:
--
--   1. The copy would find its destination occupied on every retry, so
--      `storage.copy` fails and the retry never reaches the RPC.
--   2. Paths derived from the key are IDENTICAL for a key reused with
--      different media -- so the digest stops distinguishing exactly the case
--      `20260826390000` added it for.
--   3. `deduplicated` currently makes the caller discard its staged copy. With
--      shared paths that copy IS the live job's media, so a successful replay
--      would delete the bytes the queued post is waiting to publish.
--
-- Instead the RPC now takes `p_media_sources`: the `bucket/path` refs the
-- CALLER named, which are stable across retries because they are the file the
-- user picked. Destinations stay random and stay the thing security is checked
-- on; sources are used for nothing but the digest.
--
-- That they are unvalidated client data is fine and worth stating plainly: this
-- digest detects a client BUG (a key that did not get reset), it is not a
-- security boundary. Keys are already scoped per user, so the only posts a
-- caller can confuse with a bad digest are their own -- which they could do by
-- reusing the key anyway.

drop function if exists public.enqueue_publish_job(text, text, text[], text, timestamptz, text, uuid, text);

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

  -- Over the RAW arguments. `p_scheduled_at` in particular must NOT be
  -- coalesced here, and the media dimension comes from the SOURCES rather than
  -- from the staged destinations -- see the header for why both matter.
  v_fingerprint := md5(jsonb_build_object(
    'platform',     p_platform,
    'content_type', p_content_type,
    -- SOURCES, not destinations. See the header: destinations carry a fresh
    -- random batch id on every invocation, so digesting them makes every retry
    -- look like a different post.
    'media',        to_jsonb(p_media_sources),
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

revoke execute on function public.enqueue_publish_job(text, text, text[], text[], text, timestamptz, text, uuid, text)
  from public, anon;
grant execute on function public.enqueue_publish_job(text, text, text[], text[], text, timestamptz, text, uuid, text)
  to authenticated, service_role;
