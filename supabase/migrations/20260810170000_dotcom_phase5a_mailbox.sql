-- Phase 5a of the dragoncandy.io -> dragoncandy.com migration: THE ONE STORED MAILBOX.
--
-- Phase 4 moved every stored URL and deliberately refused to touch a mailbox, with a
-- guard that would RAISE if one appeared in the rows it rewrote. This is the counterpart
-- that moves the single mailbox Phase 4 left behind:
-- `help_articles.gdpr-erasure` tells users to email privacy@dragoncandy.io for
-- data-rights questions.
--
-- WHY IT WAS SAFE TO DO NOW, AND NOT THEN. Phase 4's gate was "the .com mailbox is proven
-- to RECEIVE". The obvious test for that turned out to be worthless: an SMTP `RCPT TO`
-- probe returned 250 for all five candidate addresses AND for two deliberately
-- nonsensical control addresses, because Google's MX does not disclose recipient validity
-- at RCPT time. Without the controls that probe would have read as proof.
--
-- What actually cleared the gate was reading the Google Workspace admin console on
-- 2026-08-10: `privacy@dragoncandy.com` is an ALIAS on `dame@dragoncandy.com`, an active
-- account in daily use (three users in the org, zero groups, so the alias list is the
-- whole story). That establishes the ROUTING rather than a single delivery, which is
-- strictly stronger evidence than the send-and-receive test originally planned.
--
-- WHY A MIGRATION: the row was seeded by 20260512000001, which has already run. Editing
-- an applied migration changes NOTHING in prod -- it only makes the repo disagree with the
-- database. Forward-only UPDATE is the sole mechanism that moves a seeded row. (Same
-- reasoning as Phase 4; recorded again because it is the mistake this class invites.)
--
-- This is why `.io` must never be allowed to LAPSE OR TRANSFER even after this migration:
-- a GDPR erasure request carries identity PII by definition, and mail addressed to
-- privacy@dragoncandy.io will keep arriving from every copy of the old article that
-- already reached a user. Moving the published address reduces future exposure; it does
-- not retire the old mailbox.
--
-- Nothing here is destructive: `replace()` is a no-op on a row that has already moved, and
-- the statement is filtered on containing the old string.

-- ---------------------------------------------------------------------------
-- Guard: this migration expects to move EXACTLY ONE mailbox and nothing else.
-- ---------------------------------------------------------------------------
-- Verified against prod 2026-08-10: `gdpr-erasure` is the only row still containing
-- `dragoncandy.io`, its single occurrence IS the mailbox, and no other article carries a
-- mailbox on either TLD. If a later edit reintroduces a `.io` URL into this row, the
-- rewrite below would silently move that too -- so assert the shape first rather than
-- trusting it. A guard narrower than the operation it guards is decorative (the lesson
-- `data-exposure-reviewer` taught on the Phase 4 guard).
do $$
declare
  v_total int;
  v_mailbox int;
begin
  select coalesce((select count(*) from regexp_matches(body, 'dragoncandy\.io', 'g')), 0),
         coalesce((select count(*) from regexp_matches(body, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*dragoncandy\.io', 'g')), 0)
    into v_total, v_mailbox
    from public.help_articles
   where slug = 'gdpr-erasure';

  -- Already migrated (or the row is gone): nothing to assert, the UPDATE no-ops.
  if v_total = 0 then
    raise notice 'Phase 5a: gdpr-erasure carries no dragoncandy.io -- already migrated.';
    return;
  end if;

  if v_total <> v_mailbox then
    raise exception
      'Refusing to rewrite gdpr-erasure: % dragoncandy.io occurrence(s) but only % are mailboxes. A non-mailbox .io reference appeared since this migration was written -- re-scope it before running.',
      v_total, v_mailbox;
  end if;
end $$;

update public.help_articles
   set body = replace(body, 'privacy@dragoncandy.io', 'privacy@dragoncandy.com'),
       updated_at = now()
 where slug = 'gdpr-erasure'
   and body like '%privacy@dragoncandy.io%';

-- `updated_at` is set explicitly because help_articles has NO handle_updated_at trigger
-- (verified against pg_trigger 2026-08-10) -- unlike aios_playbooks, which does.
--
-- The search index maintains itself: trg_help_articles_search_vector fires
-- BEFORE INSERT OR UPDATE OF title, body, search_terms, so the tsvector is rebuilt from
-- the new body in the same statement. `search_vector` is is_generated: NEVER, so this is
-- load-bearing, not incidental -- without that trigger the index would still match the old
-- address while the rendered article showed the new one.

-- ---------------------------------------------------------------------------
-- Self-assert the end state. A migration that "succeeded" is not evidence the row moved;
-- this project has been bitten by recorded-not-actual before ([[Content Delivery State
-- Machine]], [[Updated-At Trigger Drift]]).
-- ---------------------------------------------------------------------------
do $$
declare
  v_stale int;
  v_moved int;
begin
  select count(*) into v_stale
    from public.help_articles
   where body ~ '@[A-Za-z0-9.-]*dragoncandy\.io';

  select count(*) into v_moved
    from public.help_articles
   where slug = 'gdpr-erasure' and body like '%privacy@dragoncandy.com%';

  if v_stale <> 0 then
    raise exception 'Phase 5a: % help article(s) still contain an @...dragoncandy.io mailbox', v_stale;
  end if;
  if v_moved <> 1 then
    raise exception 'Phase 5a: gdpr-erasure does not contain privacy@dragoncandy.com after the update';
  end if;

  raise notice 'Phase 5a OK: the last stored .io mailbox is moved; zero remain across help_articles.';
end $$;
