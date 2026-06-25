# verify-knowledge — loop memory

> Read **Lessons** before every run; add a **Run Log** entry at the top after every run.
> Full contract: `docs/wiki/concepts/loop-memory-protocol.md`
>
> **Validator caveat:** Lessons here are **advisory** — they may sharpen your prose and your
> `missing[]` remediation hints, or remind you what to watch for. They MUST NOT change the
> deterministic `met` checks (those stay reproducible: same state in, same verdict out).

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)

_None yet — the first run seeds this. Promote durable takeaways here (e.g. recurring
lint/freshness failure modes, clearer remediation phrasings) — advisory only._

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)

### [2026-06-24] Test-Mode Stripe UX knowledge-sync (PR #169)
- Output: emitted `done:true` (all 3 met) closing the knowledge-sync loop for the test-mode Stripe UX session.
- Happened: ran all 3 checks. (a) orphan re-check on origin/main clean; (b) RAG_LAST 19:15:10Z > LAST_WIKI_SYNC 19:14:40Z, post-merge hook synced wiki errors=0 (+1 inserted = the new concept page); (c) new concept + updated entity both in index.md + the `[2026-06-24] ingest` log.md entry.
- Worked: post-merge hook auto-synced RAG before the validator ran, so (b) was already green — no fix iteration needed.
- Failed: none.
- Remember: when knowledge-sync merges via the docs PR and main is fast-forwarded, the post-merge hook makes (b) green before this validator runs — first-pass `done:true` is the expected path. (advisory)

_No runs recorded before this._

<!-- Template for each run (newest on top):
### [YYYY-MM-DD HH:MM] <what was validated>
- Output: <the verdict block this run emitted; never a duplicate>
- Happened: <which checks ran, what the verdict was>
- Worked: <what went well>
- Failed: <which checks failed / were BLOCKED>
- Remember: <advisory takeaway; note "→ promoted to Lessons" when durable>
-->
