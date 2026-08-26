-- Refuse to queue a post for a connection that never granted publishing.
--
-- Split out of 20260826290000 rather than appended to it: that version is
-- already recorded in the ledger, so `db:apply` would refuse it and the change
-- would sit in the repo looking applied while doing nothing. An applied
-- migration is never edited here.
-- ---------------------------------------------------------------------------
-- WHY (Codex round 2)
--
-- `INSTAGRAM_SCOPES` does not yet request
-- `instagram_business_content_publish`, because Meta will not grant an advanced
-- permission before App Review approves it and asking early breaks the consent
-- screen for everyone who is not a developer on the app. So today EVERY
-- connection lacks it -- verified on prod, where the one live row records
-- exactly `instagram_business_basic` and `instagram_business_manage_insights`.
--
-- Without this check the queue accepts work it cannot do: the media is copied,
-- a container is built, Meta refuses, an attempt is burned, and the row ends up
-- `stuck` carrying a Graph error rather than the one sentence that explains it.
--
-- Checked in SQL as well as in the edge function for the same reason the URL
-- rule is: the TypeScript copy gives a caller a good message, this one is the
-- copy a future call site cannot route around.
--
-- Note this FAILS CLOSED where `isInsightsPermissionMissing` deliberately fails
-- open. That asymmetry is not an oversight of the sibling. Insights degrade to
-- an empty chart if we guess wrong, so an unrecorded permission list lets Meta
-- judge; a publish does not degrade, it fails after doing irreversible-adjacent
-- work, and the answer here is knowable rather than absent.
-- ---------------------------------------------------------------------------
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
begin
  if v_user is null then
    return jsonb_build_object('enqueued', false, 'reason', 'authentication required');
  end if;

  if p_content_type not in ('feed', 'reels', 'stories') then
    return jsonb_build_object('enqueued', false, 'reason', 'unsupported content_type');
  end if;

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
    if position('://' in v_path) > 0 or v_path like '//%' then
      return jsonb_build_object('enqueued', false, 'reason', 'media must be a storage path, not a URL');
    end if;
    if v_path not like v_user::text || '/%' then
      return jsonb_build_object('enqueued', false, 'reason', 'media does not belong to you');
    end if;
    if position('..' in v_path) > 0 then
      return jsonb_build_object('enqueued', false, 'reason', 'invalid media path');
    end if;
  end loop;

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
