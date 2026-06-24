# knowledge-sync — loop memory

> Read **Lessons** before every run; add a **Run Log** entry at the top after every run.
> Full contract: `docs/wiki/concepts/loop-memory-protocol.md`

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)

- **[orphans] Run the orphan check every run.** The `wiki-save-answer` flow adds `analyses/`
  pages + syncs RAG but does NOT update `index.md`, so its pages land as catalog orphans
  (caught 2: [[Competitive Advantage]], [[Influencer/Creator Outreach]]). Before finishing,
  list `concepts|entities|analyses/*.md` not referenced in `index.md` and add any missing.
- **[rag-sync] Don't hand-sync after merge.** The committed post-merge git hook auto-runs
  `sync:wiki` + `sync:internal` on a **main** fast-forward that touched `docs/`. Verify via
  `.git/knowledge-sync.log` — `errors=0` is the authority (not counts); confirm retrievability
  with a `content ilike` query on the changed pages.
- **[scope] Branch off `origin/main`, not the just-merged worktree.** A merged feature branch
  is squash-diverged; author knowledge-sync docs on a fresh branch for a clean PR.

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)

### [2026-06-24] Loop memory shipped + security triage capture + orphan fix
- Output: PR #166 (`raw/sessions/2026-06-24-…`, `concepts/security-definer-advisor-triage.md`,
  `loop-memory-protocol.md` status, index.md+log.md, PROJECT_CONTEXT.md) + this orphan-fix PR
  (index.md entries for the 2 orphans).
- Happened: captured the session, merged #166, RAG auto-synced (errors=0, confirmed by content
  query). Close-the-loop lint caught 2 pre-existing orphans → fixed in this follow-up.
- Worked: post-merge hook auto-synced both RAG stores; `content ilike` verified retrievability.
- Failed: missed appending this Run Log entry to #166 itself (the loop-memory dogfood) → done
  here; the 2 orphans were pre-existing from `wiki-save-answer`.
- Remember: orphan-check + the wiki-save-answer gap → **promoted to Lessons**.

<!-- Template for each run (newest on top):
### [YYYY-MM-DD HH:MM] <session/topic>
- Output: <wiki session source + pages + core-doc edits; never a duplicate of the output>
- Happened: <what was captured, which core docs refreshed, RAG synced?>
- Worked: <what went well>
- Failed: <what the verify-knowledge verdict's missing[] flagged / what went wrong>
- Remember: <takeaway; note "→ promoted to Lessons" when durable>
-->
