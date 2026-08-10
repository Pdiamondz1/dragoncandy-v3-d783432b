---
title: Donny RAG Scope Boundary
type: concept
created: 2026-08-10
updated: 2026-08-10
sources: [2026-08-10-wiki-rag-consumer-scope.md]
tags: [donny-rag, scope, data-exposure, knowledge-sync, allowlist, wiki]
---
# Donny RAG Scope Boundary

Who can retrieve what from `donny_knowledge`. Consumer Donny (a restaurant owner, creator or
brand in the app) and internal Donny (`/internal`, AIOS) read the **same table**, separated by
one nullable `scope` column. This page is the boundary's rules; [[Knowledge-Sync Automation]] is
the plumbing that writes it.

## The mechanism

`donny-orchestrator/rag.ts` reads with `scope: "consumer"` by default:

- **Cosine path** — `match_donny_knowledge(query_embedding, match_count, scope_filter)`. Its
  consumer branch is `dk.scope IS NULL OR dk.scope <> 'internal'`, and it `RAISE`s
  `forbidden: internal scope requires internal access` when `scope_filter='internal'` and the
  caller is neither `is_internal_user()` nor `service_role`.
- **FTS fallback** — the same predicate spelled `.or("scope.is.null,scope.neq.internal")`.

**`scope NULL` is consumer-reachable.** That is the single fact every defect on this page
comes from: the permissive value is also the default.

Retrieved chunks reach `agents/general.ts`, the catch-all for greetings and open questions, so
anything consumer-reachable can surface in an answer to *"what is DragonCandy?"*.

## The wiki does not reach consumers at all (2026-08-10, PRs #434 → #437)

`sync-wiki-to-donny.mjs` syncs **only** the pages listed in its `CONSUMER` allowlist —
**currently none** — at consumer scope. Every other wiki page is not sent. To publish one, read
it end to end, strip anything an end user must not see, then add its exact `<dir>/<filename>`.
Preview with `SYNC_DRY_RUN=1 node supabase/scripts/sync-wiki-to-donny.mjs`, which prints the list
and POSTs nothing.

**`donny-knowledge-sync` recomputes `scope` from the script payload on every sync**, insert or
update — it does not preserve the DB's value. So for a page the script *sends*, the script is the
sole source of truth and a one-off DB fix does not hold. For a page it no longer sends, nothing
overwrites the row at all — which is what the orphan check under Known Issues exists for.

> **This section described a different mechanism until #437, and the reason is worth keeping.**
> #434 marked every non-allowlisted page `scope:"internal"` rather than skipping it. That closed
> the leak, but it duplicated rows `sync-internal-docs.mjs` already writes — measured on prod,
> **113 pages embedded twice, 109 byte-identical** — so internal Donny could spend two of its five
> RAG slots on one page, every sync paid double the embedding cost, and the duplicate was the only
> copy subject to this script's hard oversize skip. #437 stops sending them and the 113 rows were
> pruned (249 → 136).

### Why an allowlist, not a denylist

The previous shape was two denylists, and it failed twice over:

1. **`EXCLUDE` (19 pages) never ran.** It gated on `SYNC_CURATE=1`, which the unattended
   `npm run sync:wiki` from the `post-merge` hook never sets. Its 19 pages synced to the
   consumer RAG at `scope null` on every merge. The script's own comment already said so in
   writing; `FORCE_INTERNAL` was created as the remedy and the stale entries were never moved.
2. **A denylist fails OPEN.** It holds only what someone thought to enumerate, so the worst
   pages were on *neither* list. `entities/dragoncandy-platform` states the live user count,
   the vendor-by-vendor burn, and that Stripe is in test mode — and it was reachable by the
   `general` agent.

An allowlist fails **closed**: a page added by `/wiki-ops ingest` is internal until someone
deliberately publishes it.

### Nothing is lost internally — the mirror is the real copy

`sync-internal-docs.mjs` writes an `internal-<dir>:<slug>` copy of **every** wiki page at
`scope='internal'`, and `wiki-merge-pr` writes that same namespace through
`_shared/wiki-sync-payload.ts`. So the internal copy has **two** writers and
`sync-wiki-to-donny.mjs` has one, and since #437 the `wiki:<dir>/<slug>` namespace holds only
what the allowlist publishes — today, nothing. Internal Donny reads the mirror.

The two paths also differ in how they handle a large page, which matters more than it looks:

| | `internal-<dir>:<slug>` | `wiki:<dir>/<slug>` |
|---|---|---|
| Oversize behaviour | embeds the first `MAX_EMBED_CHARS` (24,000), keeps the **full** markdown in `internal_docs` | **hard-skips at `FAIL_CHARS` (31,000)** and exits 1 |
| Why the difference | `full_content` is accepted, because the page is internal scope | `full_content` is rejected on anything but internal scope, and a consumer page is by definition not internal |

That asymmetry is why the four oversize pages were once queued for splitting: the **duplicate**
was the copy that would hard-fail, not the one anyone reads. With the duplicate gone, an oversize
page degrades to a truncated embed with its full text still readable in `internal_docs` — so
splitting is now a retrieval-quality improvement (tail coverage, focused units), not a fix for a
broken sync.

## The wiki is not consumer material, and that is not a gap

Read end to end, the best consumer candidates are all written for an internal reader:
`take-rate-ladder` (*"all four streams stack on one customer"*), `dragondash` (*"the profit
engine — premium margins"*), `trust-then-flag-model` (*"MVPs over-gate"*), and even
`campaign-lifecycle` — the cleanest page in the set — lists DB tables and a trigger name.

Consumer product knowledge belongs in `help_articles` and `/help` (see
[[Help Center & Donny Guidance]]), which is what users actually read.

**The sharpest measurement:** after #434 the consumer predicate returned **0 of 247** rows, and
after #437's prune it is **0 of 136** —
every non-wiki row was already internal. Consumer Donny's entire RAG *was* the 107 leaking
pages. There was never a legitimate consumer knowledge base to lose, and `agents/general.ts`
already degrades gracefully (`"No additional context available."`).

## Known Issues / Gotchas

- **Un-publishing is NOT self-healing, and the orphan check is the whole compensation.** While
  the script sent every page (#434), dropping one from the allowlist overwrote its row back to
  internal on the next run. Since #437 it sends only allowlisted pages, so a removed page is
  simply never sent again and its row strands at `scope null`, consumer-retrievable, forever —
  the same silent rot `EXCLUDE` had. The script therefore does a **read-only** GET diffing the
  `wiki:` rows against the allowlist, names any orphans **with their actual scope**, prints the
  prune SQL, and carries the count into the exit code. It only reads: giving a sync script
  `DELETE` on `donny_knowledge` has a worse blast radius than the drift it fixes. It fails
  **open** on a REST error, because the sync did not create the drift. Note the orphan class is
  not allowlist-specific — renaming *any* published page strands its old row, because nothing
  deletes.
- **A prune does not stick until the new script is on `main` — this actually happened.** The
  113 duplicates were pruned, and then reappeared. The cause was not a failed delete: the
  committed `post-merge` hook fired on a main fast-forward and ran the script **as it existed on
  main at that moment** — the #434 version — which re-inserted all 113 (`inserted=113` in
  `.git/knowledge-sync.log`). Ordering rule: **merge the script change first, prune second.**
  Between the two, any sync from `main` undoes the prune. Read the hook log before concluding a
  delete failed.
- **`scope:"internal"` had a side effect beyond the column, now retired.** In
  `donny-knowledge-sync`, an internal page with no `full_content` also reads
  `internal_docs.archived_at` for its `metadata.path`, and an **archived** doc gets its
  `donny_knowledge` row DELETED instead of upserted. Under #434 that branch saw all 112 wiki
  pages; since #437 this script sends no internal pages at all, so the behaviour belongs to
  `sync-internal-docs.mjs`, where it is the right owner. Prod holds 114 `docs/wiki/%` paths with
  **0** archived.
- **Don't `process.exit()` after a fetch in these scripts.** Adding the orphan check's second
  fetch host made `process.exit(1)` tear the process down while undici still held a pooled
  socket — on Windows that aborts with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`
  and exit **127**, masking the 1 it meant to return. `process.exitCode` lets the loop drain.
  This also explains the assertion [[Knowledge-Sync Automation]] documented as "harmless" noise.
- **The guard is keyed on exact `<dir>/<filename>`.** A rename, move or split silently stops the
  match. Under the old denylist that reopened a leak; under the allowlist it over-protects, plus
  the orphan above.
- **A test guards the default.** `src/lib/wikiSyncConsumerScope.test.ts` asserts the literal
  `else { page.scope = "internal" }` line, that every allowlist entry exists on disk, and that no
  denylist is reintroduced — matched on **declarations, not mentions**, so the script's comments
  can keep narrating the history. It replaced `wikiSyncForceInternal.test.ts`, which parsed the
  deleted `FORCE_INTERNAL` set and threw at module load once it was gone.
- **Precedent.** The same leak class was fixed once before, page by page: two never-built DRE
  reward specs were consumer-reachable at `scope NULL`, so Donny could promise rewards that do
  not exist ([[Dragon Rewards Engine (DRE)]]). Fixing instances rather than the default is why it
  recurred at 107×.

## See Also
- [[Knowledge-Sync Automation]] — the sync plumbing and the secret resolver
- [[Self-Improving App]] — the content loop that keeps adding pages
- [[Dragon Rewards Engine (DRE)]] — the precedent leak
- [[Service-Role Data Exposure]] — the same "who can reach this?" question at the SQL layer
- [[Honest Analytics]] — the sibling principle: never show a user a claim the data cannot support
- [[Help Center & Donny Guidance]] — where consumer-facing knowledge actually lives
