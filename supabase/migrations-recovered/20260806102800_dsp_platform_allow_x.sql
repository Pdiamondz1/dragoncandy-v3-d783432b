-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260806102800 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

alter table public.donny_scheduled_posts
  drop constraint donny_scheduled_posts_platform_check;

alter table public.donny_scheduled_posts
  add constraint donny_scheduled_posts_platform_check
    check (platform = any (array[
      'instagram'::text, 'tiktok'::text, 'youtube'::text, 'twitter'::text,
      'facebook'::text, 'x'::text
    ]));
