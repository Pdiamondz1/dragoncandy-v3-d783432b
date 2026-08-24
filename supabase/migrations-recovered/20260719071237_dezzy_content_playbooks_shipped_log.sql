-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260719071237 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

update aios_playbooks set
  task_md = replace(
    replace(
      task_md,
      '- Mon — Platform feature spotlight: the most recent shipped feature from the brief / PROJECT_CONTEXT active workstreams, or a Donny AI demo.',
      '- Mon — Platform feature spotlight: the most recent shipped feature — read the TOP of docs/SHIPPED_LOG.md (newest first; read only the first few entries, the file is long) or use the brief — or a Donny AI demo.'
    ),
    'read PROJECT_CONTEXT plus any brand/positioning and GTM docs for voice, value props, and the North Star)',
    'read PROJECT_CONTEXT for voice, value props and the North Star — note §5 is now a one-line INDEX, so for shipped-feature detail read the TOP of docs/SHIPPED_LOG.md instead — plus any brand/positioning and GTM docs)'
  ),
  done_criteria_md = replace(
    done_criteria_md,
    'The Monday spotlight names a real shipped feature from the brief/PROJECT_CONTEXT (or states none shipped).',
    'The Monday spotlight names a real shipped feature from the brief or docs/SHIPPED_LOG.md (or states none shipped).'
  ),
  updated_at = now()
where slug = 'dezzy-content-calendar';

update aios_playbooks set
  task_md = replace(
    replace(
      task_md,
      'read PROJECT_CONTEXT "Active Workstreams"/shipped items and a brand/positioning doc)',
      'read docs/SHIPPED_LOG.md — the full prose record of shipped work, newest entries at the TOP; read only the first few, the file is long. PROJECT_CONTEXT §5 is now a one-line index, useful for titles and pointers but NOT for detail — and a brand/positioning doc)'
    ),
    'Use only features actually present in the brief / PROJECT_CONTEXT — do not invent or embellish capabilities.',
    'Use only features actually present in the brief / docs/SHIPPED_LOG.md — do not invent or embellish capabilities.'
  ),
  preferences_md = replace(
    preferences_md,
    'every feature and benefit must trace to the brief or PROJECT_CONTEXT;',
    'every feature and benefit must trace to the brief or docs/SHIPPED_LOG.md;'
  ),
  done_criteria_md = replace(
    done_criteria_md,
    'traces to a tool result (the brief or PROJECT_CONTEXT);',
    'traces to a tool result (the brief or docs/SHIPPED_LOG.md);'
  ),
  updated_at = now()
where slug = 'dezzy-website-updates';
