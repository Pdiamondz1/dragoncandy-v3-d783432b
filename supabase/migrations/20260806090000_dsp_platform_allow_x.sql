-- Task 1 (amplification-and-reconciliation): useSponsorshipAmplification.ts is
-- about to start writing donny_scheduled_posts rows (so it stops being the one
-- publish path the outstand-webhook choke point can never measure -- see that
-- hook and supabase/functions/outstand-webhook/index.ts's recordPublishedPost).
-- It resolves its platform from business_outstand_accounts, and the two tables'
-- platform vocabularies are disjoint on exactly one value:
--
--   donny_scheduled_posts_platform_check (verified on prod 2026-08-06):
--     CHECK (platform = ANY (ARRAY['instagram','tiktok','youtube','twitter','facebook']))
--
--   business_outstand_accounts_platform_check (verified on prod 2026-08-06):
--     CHECK (platform = ANY (ARRAY['facebook','instagram','tiktok','x','youtube']))
--
-- Outstand's own network value is 'x' -- donny_scheduled_posts is the outlier,
-- still carrying the older 'twitter' spelling. Writing a schedule row for an X
-- account would violate today's CHECK. Add 'x' to the union while KEEPING
-- 'twitter': existing rows may already use it, and removing a CHECK value is
-- forbidden (CLAUDE.md — never drop or rename, additive only). 'twitter' is
-- retained for existing data; 'x' is the canonical value going forward.
alter table public.donny_scheduled_posts
  drop constraint if exists donny_scheduled_posts_platform_check;

alter table public.donny_scheduled_posts
  add constraint donny_scheduled_posts_platform_check
    check (platform = any (array[
      'instagram'::text, 'tiktok'::text, 'youtube'::text, 'twitter'::text,
      'facebook'::text, 'x'::text
    ]));
