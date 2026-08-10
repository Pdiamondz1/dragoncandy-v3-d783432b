-- Phase 4 of the dragoncandy.io -> dragoncandy.com migration: PROD CONTENT.
--
-- Phases 1-3 moved the app, the config and the redirect. This migration moves the
-- content stored in the database, which no code change can reach: help articles a
-- brand-new user reads, and the Dezzy SEO playbook prompt.
--
-- WHY A MIGRATION AND NOT AN EDIT TO THE SEED FILES: the original rows were seeded by
-- 20260427120000 / 20260512000001 / 20260628120000, which have already run. Editing a
-- migration that has already been applied changes NOTHING in prod -- it only makes the
-- repo disagree with the database. Forward-only UPDATE is the sole mechanism that
-- actually moves a seeded row.
--
-- SCOPE -- deliberately URLs only, never mailboxes:
--   help_articles.gdpr-erasure contains `privacy@dragoncandy.io`, and it is NOT touched
--   here. The .com mailboxes do not exist yet; the mailbox move is Phase 5 and is gated
--   on a real send-and-receive test per mailbox. Repointing a GDPR erasure contact at an
--   address that may not receive is strictly worse than leaving a stale address that
--   does -- erasure requests and Stripe dispute alerts land there. A stale-but-delivering
--   address beats a fresh-but-dead one.
--
-- The guard below turns that reasoning into an assertion rather than a comment, so a
-- future body edit cannot quietly drag a mailbox along with a URL rewrite.
--
-- Nothing here is destructive: `replace()` is a no-op on a row that has already moved,
-- and every statement is filtered on containing the old string.

-- ---------------------------------------------------------------------------
-- Guard: refuse to rewrite a targeted row that contains an @dragoncandy.io mailbox.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.help_articles
    where slug in ('signup-restaurant', 'signup-creator', 'signup-brand')
      and body ~ '@dragoncandy\.io'
  ) then
    raise exception
      'Refusing to rewrite: an @dragoncandy.io mailbox appears in a targeted help article. Mailbox moves are Phase 5 (gated on a receive test), not Phase 4.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Help articles -- the "where do I sign up" instruction in the three signup guides.
--    These are the first thing a brand-new user reads, and they name the domain in bold.
--    .io still resolves (it 308s), so this is not a broken link -- it is the wrong brand
--    string in the highest-visibility place we put one.
--
--    `updated_at` is set explicitly because help_articles has NO handle_updated_at
--    trigger (verified against pg_trigger 2026-08-10) -- unlike aios_playbooks below,
--    which does. Nothing in the UI renders this column today; it is set for provenance.
--
--    The search index maintains itself: trg_help_articles_search_vector fires
--    BEFORE INSERT OR UPDATE OF title, body, search_terms, so the tsvector is rebuilt
--    from the new body in the same statement. No manual reindex, and no stale index
--    silently matching the old domain.
-- ---------------------------------------------------------------------------
update public.help_articles
   set body = replace(body, 'dragoncandy.io', 'dragoncandy.com'),
       updated_at = now()
 where slug in ('signup-restaurant', 'signup-creator', 'signup-brand')
   and body like '%dragoncandy.io%';

-- ---------------------------------------------------------------------------
-- 2. Dezzy SEO playbook -- the prompt tells the agent where articles publish. Left on
--    .io it would keep generating copy that cites the old domain in public articles
--    written for organic acquisition, which is the one place a stale domain compounds.
--    aios_playbooks HAS trg_aios_playbooks_updated_at, so updated_at moves on its own.
-- ---------------------------------------------------------------------------
update public.aios_playbooks
   set task_md = replace(task_md, 'dragoncandy.io/blog', 'dragoncandy.com/blog')
 where slug = 'dezzy-seo-articles'
   and task_md like '%dragoncandy.io/blog%';

-- ---------------------------------------------------------------------------
-- Self-assert the intended end state. A migration that "succeeded" is not evidence the
-- rows moved -- this project has been bitten by recorded-not-actual before.
-- ---------------------------------------------------------------------------
do $$
declare
  v_stale_signup int;
  v_stale_playbook int;
  v_gdpr_still_io int;
begin
  select count(*) into v_stale_signup
    from public.help_articles
   where slug in ('signup-restaurant', 'signup-creator', 'signup-brand')
     and body like '%dragoncandy.io%';

  select count(*) into v_stale_playbook
    from public.aios_playbooks
   where slug = 'dezzy-seo-articles'
     and task_md like '%dragoncandy.io/blog%';

  if v_stale_signup <> 0 then
    raise exception 'Phase 4: % signup help article(s) still contain dragoncandy.io', v_stale_signup;
  end if;
  if v_stale_playbook <> 0 then
    raise exception 'Phase 4: the dezzy-seo-articles playbook still points at dragoncandy.io/blog';
  end if;

  -- Informational, never fatal: gdpr-erasure is EXPECTED to still carry .io (its only
  -- occurrence is the privacy@ mailbox, which Phase 5 owns). This is a NOTICE and not an
  -- assertion on purpose -- if Phase 5 lands first, this migration must not fail.
  select count(*) into v_gdpr_still_io
    from public.help_articles
   where slug = 'gdpr-erasure' and body like '%dragoncandy.io%';

  raise notice 'Phase 4 content migration OK. gdpr-erasure still carries .io: % (expected 1 until Phase 5 moves the mailbox).', v_gdpr_still_io;
end $$;
