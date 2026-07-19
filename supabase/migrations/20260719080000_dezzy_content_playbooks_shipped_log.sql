-- Point the two Dezzy CONTENT playbooks at docs/SHIPPED_LOG.md for "what shipped recently".
--
-- Why: PR #294 split PROJECT_CONTEXT §5. It used to hold 68 multi-paragraph bullets of shipped-work
-- prose; it is now a one-line-per-entry INDEX, and the full prose moved to docs/SHIPPED_LOG.md
-- (collected into internal_docs by sync-internal-docs.mjs, so get_internal_doc can read it).
--
-- `dezzy-content-calendar` and `dezzy-website-updates` ground "the most recent shipped feature" in
-- §5. Combined with their strict non-fabrication rule ("use only features actually present…") and
-- `dezzy-website-updates`' explicit "if nothing notably user-facing shipped recently, say so plainly
-- and stop", the split would have left them drafting from one-liners — or stopping outright.
--
-- Scope: these TWO playbooks only. Four other playbooks also reference PROJECT_CONTEXT, but for
-- sections the split did not touch (§8 Pricing, §3 Kill-switches, positioning / North Star / GTM),
-- so they are deliberately left alone. `dezzy-weekly-brief` reads "active workstreams", which now
-- resolves to the concise In-flight + Awaiting subsections — better for a brief, not worse.
--
-- Idempotent: every change is a targeted replace() that no-ops once applied (or if the source text
-- has since changed). Nothing is overwritten wholesale.

begin;

-- ── dezzy-content-calendar ───────────────────────────────────────────────────────────────────
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

-- ── dezzy-website-updates ────────────────────────────────────────────────────────────────────
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

commit;
