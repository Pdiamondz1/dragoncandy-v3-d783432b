-- One publish queue for every platform, and one state machine to run it.
--
-- ===========================================================================
-- WHY GENERALISE RATHER THAN COPY
-- ===========================================================================
--
-- Facebook's publishing protocol is genuinely different from Instagram's --
-- one call for a photo, two for a photo story, three for a Reel, a different
-- status vocabulary, a Page token that never expires, and no equivalent of the
-- `PUBLISHED` container status that is Instagram's only evidence an
-- interrupted publish landed. Those differences are real and live in
-- `_shared/facebook-publish.ts`.
--
-- What is NOT different is everything in this table. Claiming, releasing,
-- charging an attempt, the ambiguity marker, the janitor, the two skip lists,
-- the per-account advisory lock: all of it is about OUR exactly-once
-- guarantee, not about Meta. It took six Codex rounds to get right, and
-- duplicating it per platform would give five copies that drift -- the
-- shared-helper lesson #540 recorded, where a nearly-fitting helper got copied
-- and the copies moved in whatever direction was easiest to write.
--
-- So the machine is shared and the protocol is not.
--
-- ===========================================================================
-- WHY THE OLD COLUMNS SURVIVE AS DEAD WEIGHT
-- ===========================================================================
--
-- `CLAUDE.md` forbids renaming columns, without exception, so `ig_user_id`,
-- `ig_container_id` and `ig_media_id` cannot become `account_key`,
-- `provider_ref` and `provider_post_id`. They are superseded rather than
-- renamed: nothing writes them from here on, and their NOT NULLs are dropped
-- so a Facebook job is not required to invent Instagram values.
--
-- Reusing them for Facebook data was the alternative and was rejected on the
-- founder's call: `ig_user_id` holding a Facebook Page id is exactly the
-- "nearly-but-not-quite" shape that makes the next reader believe a name that
-- is lying. Three dead nullable columns on an empty table is the cheaper scar.
--
-- This migration is free to make TODAY and not tomorrow: `publish_jobs` holds
-- zero rows and neither edge function is deployed, so there is nothing to
-- migrate and no caller to break. The backfill below is written anyway, so the
-- migration is correct rather than merely correct-in-this-instance.
--
-- ===========================================================================
-- A LATENT HOLE FOUND WHILE WRITING THIS
-- ===========================================================================
--
-- `publish_jobs_media_paths_check` is `CHECK (array_length(media_paths, 1) >= 1)`
-- and has never rejected anything. `array_length('{}', 1)` is **NULL**, not 0,
-- so the expression evaluates to NULL and a CHECK constraint PASSES on NULL.
-- Measured, not reasoned: `select (array_length('{}'::text[],1) >= 1) is null`
-- returns true on prod.
--
-- Nothing exploited it, because `enqueue_publish_job` tests
-- `array_length(...) is null` separately -- so the table constraint has been
-- decorative while the RPC did the work. Replaced below with a
-- `coalesce(..., 0)` form that actually fires, and widened at the same time,
-- because Facebook CAN publish a post with no media at all and Instagram
-- cannot.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.publish_jobs
  add column if not exists platform text not null default 'instagram',
  add column if not exists instagram_connection_id uuid
    references public.instagram_account_connections(id) on delete cascade,
  add column if not exists facebook_connection_id uuid
    references public.facebook_page_connections(id) on delete cascade,
  add column if not exists account_key text,
  add column if not exists provider_ref text,
  add column if not exists provider_post_id text;

comment on column public.publish_jobs.platform is
  'Which connector publishes this job. Adding a value is additive; a CHECK value can never be removed, so only platforms that can actually publish are listed.';
comment on column public.publish_jobs.account_key is
  'The platform''s own account id — Instagram user id, Facebook Page id. Denormalised so a reconnect to a DIFFERENT account cannot silently retarget a queued job.';
comment on column public.publish_jobs.provider_ref is
  'The in-flight handle: an Instagram container id, a Facebook video id. Persisted so a resumed job does not build a second one and publish twice.';
comment on column public.publish_jobs.provider_post_id is
  'What the platform created. Written only AFTER the publish call returned it, so "set ⇒ it went out" holds by construction.';
comment on column public.publish_jobs.ig_user_id is
  'SUPERSEDED by account_key. Never renamed (CLAUDE.md forbids it) and never written from 20260826340000 onward.';
comment on column public.publish_jobs.ig_container_id is
  'SUPERSEDED by provider_ref. See ig_user_id.';
comment on column public.publish_jobs.ig_media_id is
  'SUPERSEDED by provider_post_id. See ig_user_id.';

-- Backfill before any constraint depends on the new columns. There are no rows
-- today; this exists so the migration is correct rather than correct-by-luck.
update public.publish_jobs
   set account_key      = coalesce(account_key, ig_user_id),
       provider_ref     = coalesce(provider_ref, ig_container_id),
       provider_post_id = coalesce(provider_post_id, ig_media_id),
       instagram_connection_id = coalesce(instagram_connection_id, connection_id)
 where account_key is null
    or instagram_connection_id is null;

-- The superseded columns must stop being mandatory, or a Facebook job would
-- have to invent Instagram values to satisfy them. Widening a NOT NULL is not
-- a rename or a drop.
alter table public.publish_jobs alter column ig_user_id drop not null;
alter table public.publish_jobs alter column connection_id drop not null;

alter table public.publish_jobs alter column account_key set not null;

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

alter table public.publish_jobs drop constraint if exists publish_jobs_platform_check;
alter table public.publish_jobs add constraint publish_jobs_platform_check
  check (platform in ('instagram', 'facebook'));

-- Exactly one connection, matching the platform. This is what keeps referential
-- integrity while the table serves more than one connector -- the alternative,
-- a bare uuid plus a platform tag, has no foreign key at all and a deleted
-- connection would leave jobs pointing at nothing.
alter table public.publish_jobs drop constraint if exists publish_jobs_one_connection;
alter table public.publish_jobs add constraint publish_jobs_one_connection
  check (
    (platform = 'instagram'
       and instagram_connection_id is not null
       and facebook_connection_id is null)
    or
    (platform = 'facebook'
       and facebook_connection_id is not null
       and instagram_connection_id is null)
  );

-- Replaces `publish_jobs_media_paths_check`, which never fired. `coalesce`
-- because array_length of an empty array is NULL and a CHECK passes on NULL.
--
-- Widened deliberately: a Facebook FEED post may carry no media at all, as long
-- as it carries text. Instagram has no such case, so the exemption is scoped to
-- the platform and content type that genuinely has it rather than made general.
alter table public.publish_jobs drop constraint if exists publish_jobs_media_paths_check;
alter table public.publish_jobs drop constraint if exists publish_jobs_has_media_or_text;
alter table public.publish_jobs add constraint publish_jobs_has_media_or_text
  check (
    coalesce(array_length(media_paths, 1), 0) >= 1
    or (platform = 'facebook' and content_type = 'feed' and caption is not null)
  );

-- The two published-state invariants, moved onto `provider_post_id`. The old
-- pair referenced `ig_media_id`, which nothing writes any more -- leaving them
-- would let a `published` row exist with no proof of publication at all.
alter table public.publish_jobs drop constraint if exists publish_jobs_media_id_pairs_with_time;
alter table public.publish_jobs drop constraint if exists publish_jobs_published_has_media_id;

alter table public.publish_jobs drop constraint if exists publish_jobs_post_id_pairs_with_time;
alter table public.publish_jobs add constraint publish_jobs_post_id_pairs_with_time
  check ((provider_post_id is null) = (published_at is null));

alter table public.publish_jobs drop constraint if exists publish_jobs_published_has_post_id;
alter table public.publish_jobs add constraint publish_jobs_published_has_post_id
  check (status <> 'published' or provider_post_id is not null);

create index if not exists idx_publish_jobs_account
  on public.publish_jobs (platform, account_key);

-- ---------------------------------------------------------------------------
-- enqueue_publish_job -- now platform-aware, and Facebook names its Page.
--
-- `p_account_key` is new and is REQUIRED for Facebook, because a user may
-- administer many Pages: `facebook_page_connections` is unique on
-- `(user_id, page_id)`, where `instagram_account_connections` holds one row per
-- user and could be resolved server-side with no parameter at all.
--
-- Accepting an account id from the caller is the shape every cross-tenant hole
-- in this repo has had, so it is scoped rather than trusted: the lookup is
-- `where user_id = auth.uid() and page_id = p_account_key`. A Page id belonging
-- to someone else simply does not resolve, and the caller is told the Page is
-- not connected rather than being told whose it is.
-- ---------------------------------------------------------------------------
drop function if exists public.enqueue_publish_job(text, text[], timestamptz, text, uuid);

create or replace function public.enqueue_publish_job(
  p_platform text,
  p_content_type text,
  p_media_paths text[],
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
      content_type, caption, media_paths, scheduled_at, source_schedule_id
    )
    values (
      v_user, v_user, 'instagram', v_ig.id, v_ig.ig_user_id,
      p_content_type, p_caption, coalesce(p_media_paths, '{}'),
      coalesce(p_scheduled_at, now()), p_source_schedule_id
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
      content_type, caption, media_paths, scheduled_at, source_schedule_id
    )
    values (
      v_user, v_user, 'facebook', v_fb.id, v_fb.page_id,
      p_content_type, p_caption, coalesce(p_media_paths, '{}'),
      coalesce(p_scheduled_at, now()), p_source_schedule_id
    )
    returning id into v_job_id;
  end if;

  return jsonb_build_object('enqueued', true, 'job_id', v_job_id, 'platform', p_platform);
end;
$$;

revoke execute on function public.enqueue_publish_job(text, text, text[], timestamptz, text, uuid, text)
  from public, anon;
grant execute on function public.enqueue_publish_job(text, text, text[], timestamptz, text, uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- claim_publish_job -- one queue, claimed one platform at a time.
--
-- `p_platform` is new and matters: the rate limit is not the same number on
-- both platforms. Instagram publishes a flat 100 per rolling 24 hours per
-- account; Facebook's Page limit is a formula over engaged users, so a caller
-- that claimed the globally-oldest job and then applied Instagram's 100 to a
-- Facebook Page would be enforcing a number that means nothing there.
--
-- Null means "any platform", which keeps the existing single-platform
-- behaviour available and is what the tests use.
--
-- The advisory key is now `platform:account` rather than `ig_publish:account`.
-- Two platforms could otherwise hash to the same key on equal account ids and
-- serialise against each other for no reason -- and worse, a future platform
-- reusing an id space would share a lock with a connector it knows nothing
-- about.
-- ---------------------------------------------------------------------------
drop function if exists public.claim_publish_job(integer, integer, integer, integer, text[], uuid[]);

create or replace function public.claim_publish_job(
  p_claim_ttl_seconds integer,
  p_rate_limit integer,
  p_rate_window_seconds integer,
  p_max_attempts integer,
  p_skip_account_keys text[] default '{}',
  p_skip_job_ids uuid[] default '{}',
  p_platform text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.publish_jobs%rowtype;
  v_claim uuid := gen_random_uuid();
  v_recent integer;
  v_reclaimed integer;
  v_flagged integer;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'claim_publish_job is service-role only';
  end if;

  -- --- janitor -------------------------------------------------------------
  -- Outside the per-account lock: each UPDATE is atomic on its own row and
  -- idempotent, and this pass has to cover every account rather than the one
  -- about to be claimed. Deliberately NOT scoped to p_platform either -- an
  -- abandoned claim is abandoned whichever queue the caller happens to be
  -- draining, and scoping it would leave the other platform's wreckage until
  -- something else happened to run.
  --
  -- The ambiguous case runs FIRST. Reversed, a row whose publish may have
  -- landed would be moved back to `queued` by the safe branch and become
  -- eligible for a second attempt in the same call.
  update public.publish_jobs
  set status = 'needs_review',
      last_error = 'Claim expired after the publish call was issued -- a post may already be live. Check the account before retrying.',
      claim_id = null,
      claimed_at = null,
      updated_at = now()
  where status = 'claimed'
    and claimed_at < now() - make_interval(secs => p_claim_ttl_seconds)
    and publishing_at is not null;
  get diagnostics v_flagged = row_count;

  update public.publish_jobs
  set status = 'queued',
      last_error = 'Claim expired before the publish call was issued -- safe to retry',
      claim_id = null,
      claimed_at = null,
      updated_at = now()
  where status = 'claimed'
    and claimed_at < now() - make_interval(secs => p_claim_ttl_seconds)
    and publishing_at is null;
  get diagnostics v_reclaimed = row_count;

  if v_flagged > 0 then
    raise warning 'publish_jobs: % claim(s) expired mid-publish and need review', v_flagged;
  end if;

  -- --- candidate -----------------------------------------------------------
  select * into v_job
  from public.publish_jobs
  where status = 'queued'
    and scheduled_at <= now()
    and attempts < p_max_attempts
    and (p_platform is null or platform = p_platform)
    and not (account_key = any (coalesce(p_skip_account_keys, '{}')))
    and not (id = any (coalesce(p_skip_job_ids, '{}')))
  order by scheduled_at
  limit 1;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'nothing due',
                              'reclaimed', v_reclaimed, 'flagged', v_flagged);
  end if;

  perform pg_advisory_xact_lock(hashtext(v_job.platform || ':' || v_job.account_key));

  -- Re-read inside the lock. Acting on the unlocked read is the defect
  -- `20260825150000` shipped and `20260825160000` corrected.
  select * into v_job
  from public.publish_jobs
  where id = v_job.id
    and status = 'queued'
    and scheduled_at <= now()
    and attempts < p_max_attempts;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'taken',
                              'reclaimed', v_reclaimed, 'flagged', v_flagged);
  end if;

  -- Counted inside the lock, and counting IN-FLIGHT work as well as published
  -- work. The lock ends with this transaction, long before the platform is
  -- called, so counting only `published` lets two overlapping sweeps each see
  -- the limit minus one and both publish. Scoped to the account AND the
  -- platform: an allowance is per account on one platform, never shared.
  select count(*) into v_recent
  from public.publish_jobs
  where platform = v_job.platform
    and account_key = v_job.account_key
    and (
      (status = 'published' and published_at > now() - make_interval(secs => p_rate_window_seconds))
      or status = 'claimed'
      or (status = 'needs_review'
          and publishing_at > now() - make_interval(secs => p_rate_window_seconds))
    );

  if v_recent >= p_rate_limit then
    return jsonb_build_object('claimed', false, 'reason', 'rate_limited',
                              'platform', v_job.platform, 'account_key', v_job.account_key,
                              'recent', v_recent,
                              'reclaimed', v_reclaimed, 'flagged', v_flagged);
  end if;

  update public.publish_jobs
  set status = 'claimed',
      claim_id = v_claim,
      claimed_at = now(),
      attempts = attempts + 1,
      updated_at = now()
  where id = v_job.id;

  return jsonb_build_object(
    'claimed', true,
    'job_id', v_job.id,
    'claim_id', v_claim,
    'user_id', v_job.user_id,
    'platform', v_job.platform,
    'account_key', v_job.account_key,
    'instagram_connection_id', v_job.instagram_connection_id,
    'facebook_connection_id', v_job.facebook_connection_id,
    'content_type', v_job.content_type,
    'caption', v_job.caption,
    'media_paths', v_job.media_paths,
    'provider_ref', v_job.provider_ref,
    'reclaimed', v_reclaimed,
    'flagged', v_flagged
  );
end;
$$;

revoke execute on function public.claim_publish_job(integer, integer, integer, integer, text[], uuid[], text)
  from public, anon, authenticated;
grant execute on function public.claim_publish_job(integer, integer, integer, integer, text[], uuid[], text)
  to service_role;

-- ---------------------------------------------------------------------------
-- record_publish_ref -- was `record_publish_container`.
--
-- Renamed because "container" is Instagram's word for it; Facebook's in-flight
-- handle is a video id from an upload session. Functions may be dropped and
-- recreated -- the no-rename rule is about tables and columns, where the cost
-- is data -- and no caller is deployed.
-- ---------------------------------------------------------------------------
drop function if exists public.record_publish_container(uuid, uuid, text);

create or replace function public.record_publish_ref(
  p_job_id uuid,
  p_claim_id uuid,
  p_ref text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'record_publish_ref is service-role only';
  end if;

  update public.publish_jobs
  set provider_ref = p_ref,
      status = 'queued',
      claim_id = null,
      claimed_at = null,
      updated_at = now()
  where id = p_job_id
    and claim_id = p_claim_id
    and status = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.record_publish_ref(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_publish_ref(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- confirm_publish_job -- the marker, on the neutral column.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_publish_job(
  p_job_id uuid,
  p_claim_id uuid,
  p_media_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'confirm_publish_job is service-role only';
  end if;

  if p_media_id is null or p_media_id = '' then
    raise exception 'confirm_publish_job requires a post id';
  end if;

  update public.publish_jobs
  set status = 'published',
      provider_post_id = p_media_id,
      published_at = now(),
      last_error = null,
      claim_id = null,
      claimed_at = null,
      updated_at = now()
  where id = p_job_id
    and claim_id = p_claim_id
    and status = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- fail_publish_job -- `p_clear_container` becomes `p_clear_ref`.
-- ---------------------------------------------------------------------------
drop function if exists public.fail_publish_job(uuid, uuid, text, integer, boolean);

create or replace function public.fail_publish_job(
  p_job_id uuid,
  p_claim_id uuid,
  p_error text,
  p_max_attempts integer,
  p_clear_ref boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_status text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'fail_publish_job is service-role only';
  end if;

  update public.publish_jobs
  set last_error = left(coalesce(p_error, 'unknown'), 2000),
      claim_id = null,
      claimed_at = null,
      status = case when attempts >= p_max_attempts then 'stuck' else 'queued' end,
      -- Cleared only on the requeue branch. Reaching this function at all means
      -- the caller judged a retry safe, and a retry is safe only if nothing was
      -- published -- so the marker that says otherwise must not survive. On the
      -- `stuck` branch it is kept as evidence for the person reading the row.
      publishing_at = case
                        when attempts >= p_max_attempts then publishing_at
                        else null
                      end,
      -- Only when the caller says the in-flight handle is dead. Resuming from a
      -- stored ref is what stops a retry building a second one and publishing
      -- twice; that protection stays on by default and is waived explicitly.
      provider_ref = case
                       when p_clear_ref and attempts < p_max_attempts then null
                       else provider_ref
                     end,
      updated_at = now()
  where id = p_job_id
    and claim_id = p_claim_id
    and status = 'claimed'
  returning attempts, status into v_attempts, v_status;

  if v_status is null then
    return 'no_op';
  end if;

  return v_status;
end;
$$;

revoke execute on function public.fail_publish_job(uuid, uuid, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_publish_job(uuid, uuid, text, integer, boolean)
  to service_role;
