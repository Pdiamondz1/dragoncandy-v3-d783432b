# wiki-ops — loop memory

> Read **Lessons** before every run; add a **Run Log** entry at the top after every run.
> Full contract: `docs/wiki/concepts/loop-memory-protocol.md`

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)

- **The `index.md` Concepts duplication is GONE** (#412 merged; verified 2026-08-10 — one
  `## Concepts` section, one hit per entry). Write each entry **once**. Superseded lesson removed.
- **Check whether a session is a new subject or the next PHASE of an existing one.** Phase 3 of the
  Donny-first dashboard compounded onto the existing concept page; a new page would have split one
  narrative and duplicated its principles. The index summary then has to be *extended*, not
  replaced — the old summary is still true, it is just no longer the whole story.
- **Record refuted review findings, not just accepted ones.** A Codex P1 claiming `authenticated`
  cannot select `creator_profiles`' financial columns was false (proven by prod impersonation).
  A false claim about permissions that nobody writes down gets re-raised, and the next reader has
  no way to know it was already checked.
- **`log.md` is strictly reverse-chronological — PREPEND.** The skill text below says "append",
  which is wrong and has produced out-of-order entries near the bottom of the file.
  `docs/KNOWLEDGE_WIKI.md` is the authority here.
- **A session's raw source keeps growing while the ingest runs.** When a review round lands new
  findings mid-session, update the raw file *and* the concept page *and* the index summary — an
  index line that stops at "two traps" when the page records three is the kind of drift nobody
  notices until they trust the index.

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)

### [2026-08-10] ingest — Donny-first dashboard Phase 3 (creator role)
- Output: compounded `docs/wiki/concepts/donny-first-dashboard.md` (Phase 3 section, 6 new Known
  Issues, 5 new See Also); `index.md` (1 Sources entry + extended Concepts summary); `log.md` top
  entry.
- Happened: ingested `raw/sessions/2026-08-10-donny-first-creator-dashboard.md` at the end of the
  branch, with the last Codex round still running — so the raw source and the page both had to
  absorb a finding that landed after the first draft.
- Worked: compounding rather than creating. The page already owned the Phase A/B narrative, the
  audit-before-design principle and the tap-honesty rule, all of which Phase 3 extends rather than
  restates. Keeping the `DCTour` material here instead of spinning a thin page was right for the
  same reason — the zero-size fix is a consequence of this dashboard's self-hiding section.
- Failed: nearly wrote the index Concepts entry twice out of habit from the old duplication lesson.
  Checked first (`grep -c`) and found #412 had merged, so the lesson was stale — a Lesson that is
  never re-verified becomes a liability.
- Remember: extend an existing index summary, don't replace it; and record REFUTED findings, since
  a false permissions claim nobody wrote down will simply be raised again. → both promoted to
  Lessons

### [2026-08-09] ingest — Donny `social_*` tools repair
- Output: `docs/wiki/concepts/donny-social-tools.md` (new); updated [[Honest Analytics]],
  [[Social Measurement Spine]], [[Donny Data Visibility & Quick-Action Routing]]; `index.md`
  (1 source + 2 concept entries — both index copies); `log.md` top entry.
- Happened: ingested `raw/sessions/2026-08-09-donny-social-tools-repair.md` mid-branch, while
  Codex review rounds were still landing findings.
- Worked: routing the three measurement bugs into ONE stated rule (*a gate must be about the same
  thing as the claim it licenses*) rather than three bullets — the third one, found after the page
  was written, slotted in as a confirmation instead of a rewrite. Also: adding "bug class 3" to the
  existing Donny page instead of a new page, since it is the third instance of one pattern.
- Failed: the `index.md` duplicate section is a real trap — the first concept entry was written
  once and would have been silently dropped depending on which copy #412 keeps. Caught by grepping
  for the entry name and finding two hits at lines ~169 and ~250.
- Remember: check `gh pr list` before touching a shared docs file — #412 was already rewriting the
  exact region being edited. → promoted to Lessons

<!-- Template for each run (newest on top):
### [YYYY-MM-DD HH:MM] <ingest/query/lint + subject>
- Output: <pages created/updated + log.md line; never a duplicate of the output>
- Happened: <what was ingested/answered/linted>
- Worked: <what went well>
- Failed: <what was unclear / mis-categorized / contradicted>
- Remember: <takeaway; note "→ promoted to Lessons" when durable>
-->
