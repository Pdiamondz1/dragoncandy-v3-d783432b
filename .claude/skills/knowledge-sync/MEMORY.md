# knowledge-sync — loop memory

> Read **Lessons** before every run; add a **Run Log** entry at the top after every run.
> Full contract: `docs/wiki/concepts/loop-memory-protocol.md`

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)

- **[orphans] Run the orphan check every run — by PATH, not title.** The `wiki-save-answer`
  flow adds `analyses/` pages + syncs RAG but does NOT update `index.md`, so its pages land as
  catalog orphans (caught 2: [[Competitive Advantage]], [[Influencer/Creator Outreach]]). Before
  finishing, list `concepts|entities|analyses/*.md` whose **file path** is not referenced in
  `index.md` and add any missing. Match on the `(path/to/file.md)` link target, NOT the
  frontmatter `title:` — Donny-captured pages use curated index display names that differ from
  their raw long titles, so a title match throws false-positive "orphans".
- **[rag-sync] Don't hand-sync after merge.** The committed post-merge git hook auto-runs
  `sync:wiki` + `sync:internal` on a **main** fast-forward that touched `docs/`. Verify via
  `.git/knowledge-sync.log` — `errors=0` is the authority (not counts); confirm retrievability
  with a `content ilike` query on the changed pages.
- **[scope] Branch off `origin/main`, not the just-merged worktree.** A merged feature branch
  is squash-diverged; author knowledge-sync docs on a fresh branch for a clean PR.
- **[runlog-in-pr] Bundle this MEMORY.md Run Log entry INTO the docs PR commit**, not a
  separate follow-up. Forgetting it (as on the #176 run) costs a whole extra PR cycle just to
  persist one bookkeeping line.
- **[rag-verify] `donny_knowledge` has no `source_id` column** — verify retrievability with
  `content ilike '%<distinctive phrase>%'`, not a source/id filter (the query errors otherwise).

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)

### [2026-06-27] Internal Donny profile-read fix (PR #185 → paired docs PR)
- Output: docs PR off origin/main — `raw/sessions/2026-06-27-internal-donny-profile-read.md`,
  extended `concepts/internal-only-users.md` ("The profile-read trap" section + read-side rule),
  `index.md` (Sources), `log.md` ingest entry, PROJECT_CONTEXT active-workstream bullet, + THIS
  run-log entry.
- Happened: PR #185 (code) already merged WITHOUT docs, so this is the paired docs PR authored on
  a fresh branch off origin/main (per [scope]). No new concept page (compounded the existing
  internal-only-users page per "compound, don't duplicate"). Path-based orphan check clean.
  RAG sync + verify-knowledge run after this docs PR merges (post-merge hook on the docs/ ff).
- Worked: [scope] + [runlog-in-pr] + [orphans]-by-path all applied. Compounding onto the PR #180
  concept page (read-side as a sequel section) kept the knowledge in one coherent place.
- Failed: none.
- Remember: when a code PR ships without its docs (e.g. the deploy/merge happened first), the
  knowledge-sync becomes a *paired docs PR* off origin/main — same [scope] rule, just decoupled
  in time from the code PR. (advisory)

### [2026-06-26] Internal-only AIOS user FKs (PR #180 — docs bundled INTO the work PR)
- Output: PR #180 — `raw/sessions/2026-06-26-internal-only-user-fks.md`, new
  `concepts/internal-only-users.md`, updated `entities/google-workspace.md` +
  `concepts/error-handling-patterns.md` (backend non-Error-throw caveat), `index.md` + `log.md`,
  PROJECT_CONTEXT active-workstream bullet. Bundled into the **open work PR** (not a separate docs
  PR) since #180 was still unmerged — [scope] is satisfied because that branch is already off
  `origin/main`.
- Happened: ran knowledge-sync **pre-merge** (work PR open). Docs committed onto the work branch;
  RAG sync deferred to merge (the post-merge hook fires on the main fast-forward). Path-based
  orphan check clean; new page linked. On merge, rebased onto an advanced main (4 PRs landed:
  #179/#181/#182/#183) — index.md/log.md auto-merged; PROJECT_CONTEXT + this MEMORY conflicted
  (both appended), resolved keep-both.
- Worked: [scope] (fresh-off-main work branch) + [runlog-in-pr] (this entry in the docs commit) held.
- Failed: the naive **title-based** orphan check threw 4 false positives — Donny-captured analyses
  use curated `index.md` display names ≠ their frontmatter `title:`. The PATH-based check was clean.
- Remember: orphan-check by file PATH not title → **promoted into [orphans] Lesson**. For a
  pre-merge knowledge-sync run, the RAG-sync + [[verify-knowledge]] close-the-loop step is
  inherently post-merge (don't hand-sync unmerged wiki content — the human-merge gate holds).

### [2026-06-26] AIOS Stakeholder Invite backfill (PR #178 → docs PR)
- Output: this docs PR — `raw/sessions/2026-06-26-aios-stakeholder-invite.md`, new
  `concepts/aios-stakeholder-invite.md`, `index.md` (Concepts + Sources), `log.md` ingest entry,
  cross-links re-added to `concepts/aios-internal-shell.md`, + THIS run-log entry. PROJECT_CONTEXT
  already had the #178 workstream bullet → no core-doc change.
- Happened: closed the gap flagged in the prior run's [Remember] — PR #178 had shipped without a
  wiki page (the UI-polish run had to drop a dangling `[[AIOS Stakeholder Invite]]` forward link).
  Authored on a fresh branch off origin/main (per [scope]); the new page makes that forward link
  resolve, so I re-added the cross-links. Sourced entirely from the merged spec +
  PROJECT_CONTEXT bullet + edge-fn code (no live session needed).
- Worked: [scope] + [runlog-in-pr] applied; forward-link-then-backfill is a clean pattern — the
  earlier dangling link became a TODO that this run discharged.
- Failed: none.
- Remember: a deliberately-dropped dangling wikilink is a backlog item — when you later author the
  target page, re-add the cross-link from the page that wanted it (closes the loop on the forward
  link). (advisory)

### [2026-06-26] AIOS internal dashboard UI polish (PR #179 → docs PR pending)
- Output: this docs PR — `raw/sessions/2026-06-26-aios-ui-polish.md`, new
  `concepts/aios-internal-shell.md`, `index.md` (Concepts + Sources), `log.md` ingest entry,
  PROJECT_CONTEXT active-workstream bullet, and THIS run-log entry (bundled per [runlog-in-pr]).
- Happened: authored on a fresh branch off origin/main (per [scope]); orphan check clean
  (the for-loop over concepts|entities|analyses found 0); dropped a dangling
  `[[AIOS Stakeholder Invite]]` wikilink (PR #178 was shipped but never wiki-ingested — a
  pre-existing gap, left out of scope). Code PR #179 already merged; this is the paired docs PR.
- Worked: [scope] + [orphans] + [runlog-in-pr] Lessons all applied. New concept compounds on
  [[Donny Chat UX]] (the light-vs-dark sibling) instead of a thin duplicate.
- Failed: none yet (RAG sync + verify-knowledge happen after this PR merges + main ff).
- Remember: **gap noticed** — PR #178 (AIOS Stakeholder Invite) shipped without a wiki page;
  worth a backfill ingest in a future knowledge-sync (don't let merged AIOS features skip the wiki).

### [2026-06-24] Stripe webhook revival + dual-secret (PRs #173/#174 → docs PR #176)
- Output: PR #176 — `raw/sessions/2026-06-24-stripe-webhook-revival-dual-secret.md`, new
  `concepts/stripe-webhook-delivery.md`, `entities/stripe-connect.md` (Webhook Delivery
  section), `index.md` + `log.md` entries, PROJECT_CONTEXT active-workstream bullet.
- Happened: authored on a fresh branch off origin/main (per [scope]); orphan check clean;
  Codex-clean (docs-only); merged #176; ff'd main → post-merge hook synced RAG (wiki: +1
  inserted/49 updated/errors=0; internal: +1/69 updated/errors=0). Confirmed retrievability via
  `content ilike` — "Stripe Webhook Delivery" present (updated 03:27Z).
- Worked: [scope] + [orphans] + [rag-sync] Lessons all held — no hand-sync, no orphans, clean PR.
- Failed: forgot to bundle THIS run-log entry into #176 (this is a follow-up PR); first verify
  query used a non-existent `source_id` column on `donny_knowledge`.
- Remember: both failures → **promoted to Lessons** ([runlog-in-pr], [rag-verify]).

### [2026-06-24] Test-Mode Stripe UX session (PR #168 → docs PR #169)
- Output: PR #169 — `raw/sessions/2026-06-24-test-mode-stripe-ux.md`, new `concepts/test-mode-stripe-ux.md`, `entities/stripe-connect.md` cross-link, `index.md` + `log.md` entries, PROJECT_CONTEXT active-workstream. [[verify-knowledge]] verdict: `done:true` (all 3 met, first pass).
- Happened: authored docs on a fresh branch off origin/main (per [scope] Lesson), ingested, ran orphan check (clean), opened+merged #169, ff'd main → post-merge hook synced RAG (wiki: +1 inserted/48 updated/errors=0). Confirmed retrievability via `content ilike` (page present, updated 19:15Z).
- Worked: [scope] + [orphans] + [rag-sync] Lessons all applied cleanly — no hand-sync, no orphans, clean PR. Removed one dangling `[[Lovable Edge Function Deploy Gap]]` wikilink (no such page) to keep lint green.
- Failed: none. (Auto-merge is disabled on the repo → had to poll CI then merge #169 manually; not a knowledge issue.)
- Remember: repo has no auto-merge — a docs PR needs a CI poll-then-merge, not `gh pr merge --auto`. (advisory)

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
