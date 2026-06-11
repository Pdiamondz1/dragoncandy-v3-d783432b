-- Link a DragonShare submission back to the content brief that prompted it (Phase B Slice 2).
-- Nullable: most submissions don't originate from a brief. on delete set null: deleting a brief
-- never blocks/destroys a post.
alter table public.dragonshare_posts
  add column if not exists source_brief_id uuid references public.content_briefs(id) on delete set null;

create index if not exists idx_dragonshare_posts_source_brief
  on public.dragonshare_posts (source_brief_id);
