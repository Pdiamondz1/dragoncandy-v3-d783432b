-- Content Engine Phase C — link a published post back to the brief that produced it.
-- dragonshare_post_id is written by the frontend (publishDraft) for dragonshare drafts.
-- source_brief_id is resolved from that post by a BEFORE INSERT trigger; an AFTER INSERT
-- trigger sets content_briefs.social_post_log_id first-wins. content_performance carries
-- source_brief_id forward so "how did brief B perform" aggregates all posts tracing to B.

-- 1. New columns on social_post_log. Both nullable, on delete set null (deleting a post or
--    brief never destroys the published-post log row).
alter table public.social_post_log
  add column if not exists dragonshare_post_id uuid references public.dragonshare_posts(id) on delete set null,
  add column if not exists source_brief_id     uuid references public.content_briefs(id)    on delete set null;

create index if not exists idx_social_post_log_source_brief
  on public.social_post_log (source_brief_id);

-- 2. Forward column on content_performance (one-to-many: brief -> many performance rows).
alter table public.content_performance
  add column if not exists source_brief_id uuid references public.content_briefs(id) on delete set null;

create index if not exists idx_content_perf_source_brief
  on public.content_performance (source_brief_id);

-- 3. BEFORE INSERT: resolve source_brief_id from the originating dragonshare post.
--    Set-once: only fills when caller left it null and a dragonshare_post_id is present.
create or replace function public.resolve_social_post_log_brief()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dragonshare_post_id is not null and new.source_brief_id is null then
    select dp.source_brief_id into new.source_brief_id
    from public.dragonshare_posts dp
    where dp.id = new.dragonshare_post_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resolve_social_post_log_brief on public.social_post_log;
create trigger trg_resolve_social_post_log_brief
  before insert on public.social_post_log
  for each row execute function public.resolve_social_post_log_brief();

-- 4. AFTER INSERT: set the brief's outcome pointer, first-wins. Must be AFTER so the
--    social_post_log row exists for the content_briefs.social_post_log_id FK.
create or replace function public.link_brief_to_social_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_brief_id is not null then
    update public.content_briefs
    set social_post_log_id = new.id
    where id = new.source_brief_id
      and social_post_log_id is null;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_link_brief_to_social_post on public.social_post_log;
create trigger trg_link_brief_to_social_post
  after insert on public.social_post_log
  for each row execute function public.link_brief_to_social_post();
