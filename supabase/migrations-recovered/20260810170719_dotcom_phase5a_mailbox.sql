-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260810170719 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- Phase 5a: move the one stored mailbox (help_articles.gdpr-erasure -> privacy@dragoncandy.com).
-- Gate cleared by reading the Google Workspace admin console: privacy@ is an alias on
-- dame@dragoncandy.com (active account). An SMTP RCPT probe could NOT establish this -- it
-- returned 250 for two nonsense control addresses too.

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

  if v_total = 0 then
    raise notice 'Phase 5a: gdpr-erasure carries no dragoncandy.io -- already migrated.';
    return;
  end if;

  if v_total <> v_mailbox then
    raise exception
      'Refusing to rewrite gdpr-erasure: % dragoncandy.io occurrence(s) but only % are mailboxes.',
      v_total, v_mailbox;
  end if;
end $$;

update public.help_articles
   set body = replace(body, 'privacy@dragoncandy.io', 'privacy@dragoncandy.com'),
       updated_at = now()
 where slug = 'gdpr-erasure'
   and body like '%privacy@dragoncandy.io%';

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

  raise notice 'Phase 5a OK: last stored .io mailbox moved; zero remain across help_articles.';
end $$;
