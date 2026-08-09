# wiki-ops — loop memory

> Read **Lessons** before every run; add a **Run Log** entry at the top after every run.
> Full contract: `docs/wiki/concepts/loop-memory-protocol.md`

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)

- **`index.md`'s Concepts section is duplicated on `main`** — every entry appears twice, one copy
  mojibake-encoded (`â€"`) and one clean. So a new entry written once may not survive: **write it in
  both copies** until the dedupe lands. PR **#412** (`chore/wiki-index-dedupe`, open as of
  2026-08-09) collapses them; once merged, drop this lesson and write entries once. Sources,
  Entities, Flow Diagrams and Analyses are **not** duplicated.
- **`log.md` is strictly reverse-chronological — PREPEND.** The skill text below says "append",
  which is wrong and has produced out-of-order entries near the bottom of the file.
  `docs/KNOWLEDGE_WIKI.md` is the authority here.
- **A session's raw source keeps growing while the ingest runs.** When a review round lands new
  findings mid-session, update the raw file *and* the concept page *and* the index summary — an
  index line that stops at "two traps" when the page records three is the kind of drift nobody
  notices until they trust the index.

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)

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
