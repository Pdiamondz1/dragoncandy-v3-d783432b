-- `source_schedule_id` was attributable across tenants (Codex round 4).
--
-- WHY THIS IS NOT "JUST AN AUDIT COLUMN"
--
-- `enqueue_publish_job` inserted `p_source_schedule_id` straight through. The
-- foreign key to `donny_scheduled_posts` proves the row EXISTS; it says nothing
-- about who owns it. So an authenticated caller could hand the RPC any
-- schedule uuid and have their own publish job filed against someone else's
-- schedule.
--
-- The column is documented as audit-only and never read for content, which
-- bounds the damage but is exactly the reasoning that made the ORIGINAL hole in
-- this feature look harmless: `donny_scheduled_posts` is client-writable on
-- every column, and that was fine right up until something read it. An
-- attribution nobody checks is a claim waiting to be believed -- and the first
-- reader will be whoever wires native publishing into measurement, at which
-- point "which schedule produced this post" stops being decoration.
--
-- It is also the same shape this repo has closed twice already:
-- `outstand_post_ownership` (a client-asserted post id let one tenant file
-- another tenant's metrics) and `campaign_invitations.campaign_id` (a row
-- repointed at a campaign the actor had no business in). A foreign key is a
-- referential check, never an authorization check.
--
-- REFUSED rather than silently nulled. Nulling would let a caller believe the
-- attribution was recorded when it was discarded, which is the same class of
-- quiet lie as Meta discarding a story caption -- the thing the caption rule in
-- this very function exists to prevent.

create or replace function public.enqueue_publish_job(
  p_content_type text,
  p_media_paths text[],
  p_scheduled_at timestamptz default null,
  p_caption text default null,
  p_source_schedule_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_conn public.instagram_account_connections%rowtype;
  v_path text;
  v_job_id uuid;
  v_owns boolean;
begin
  if v_user is null then
    return jsonb_build_object('enqueued', false, 'reason', 'authentication required');
  end if;

  if p_content_type not in ('feed', 'reels', 'stories') then
    return jsonb_build_object('enqueued', false, 'reason', 'unsupported content_type');
  end if;

  -- Instagram DISCARDS a caption on a stories container. Refusing here is the
  -- difference between an owner knowing their story has no text and believing
  -- it has some.
  if p_content_type = 'stories' and p_caption is not null then
    return jsonb_build_object('enqueued', false, 'reason', 'stories cannot carry a caption');
  end if;

  if p_media_paths is null or array_length(p_media_paths, 1) is null then
    return jsonb_build_object('enqueued', false, 'reason', 'no media');
  end if;

  foreach v_path in array p_media_paths loop
    if v_path is null or v_path = '' then
      return jsonb_build_object('enqueued', false, 'reason', 'empty media path');
    end if;

    -- A path, never a URL. Instagram fetches the media from whatever we hand
    -- it, so a caller-supplied URL would publish arbitrary remote content under
    -- our app's credentials.
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

  -- THE NEW CHECK. A foreign key proves the schedule exists; only this proves
  -- it is the caller's.
  if p_source_schedule_id is not null then
    select exists (
      select 1 from public.donny_scheduled_posts
      where id = p_source_schedule_id and user_id = v_user
    ) into v_owns;

    if not v_owns then
      return jsonb_build_object('enqueued', false, 'reason', 'that schedule is not yours');
    end if;
  end if;

  select * into v_conn
  from public.instagram_account_connections
  where user_id = v_user;

  if not found then
    return jsonb_build_object('enqueued', false, 'reason', 'no Instagram account connected');
  end if;

  if v_conn.status <> 'active' then
    return jsonb_build_object('enqueued', false, 'reason', 'connection is not active');
  end if;

  if not (coalesce(v_conn.permissions, '{}') @> array['instagram_business_content_publish']) then
    return jsonb_build_object('enqueued', false,
      'reason', 'this Instagram account has not granted publishing access — reconnect it and allow posting');
  end if;

  insert into public.publish_jobs (
    user_id, acting_user_id, connection_id, ig_user_id,
    content_type, caption, media_paths, scheduled_at, source_schedule_id
  )
  values (
    v_user, v_user, v_conn.id, v_conn.ig_user_id,
    p_content_type, p_caption, p_media_paths,
    -- "post now" is a schedule whose time has already arrived.
    coalesce(p_scheduled_at, now()),
    p_source_schedule_id
  )
  returning id into v_job_id;

  return jsonb_build_object('enqueued', true, 'job_id', v_job_id);
end;
$$;

revoke execute on function public.enqueue_publish_job(text, text[], timestamptz, text, uuid)
  from public, anon;
grant execute on function public.enqueue_publish_job(text, text[], timestamptz, text, uuid)
  to authenticated, service_role;
