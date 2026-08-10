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

## The wiki is internal by default (2026-08-10, PR #434)

`sync-wiki-to-donny.mjs` marks **every** page `scope:"internal"` unless its exact
`<dir>/<filename>` is in the `CONSUMER` allowlist — **currently empty**. To publish a page,
read it end to end, strip anything an end user must not see, then add the path. Check the
result with `SYNC_DRY_RUN=1 node supabase/scripts/sync-wiki-to-donny.mjs`, which prints the
split without POSTing.

**`donny-knowledge-sync` recomputes `scope` from the script payload on every sync**, insert or
update — it does not preserve the DB's value. So the script is the sole source of truth and a
one-off DB fix does not hold.

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

### Nothing is lost internally — the wiki is already mirrored

`sync-internal-docs.mjs` writes an `internal-<dir>:<slug>` copy of **every** wiki page at
`scope='internal'`. Measured 1:1 on prod (112 wiki pages, 112 internal copies). Internal Donny
reads those; the `wiki:<dir>/<slug>` rows exist **only** to populate the consumer scope.

So "mark internal" is purely *removal from consumer reach*, never a loss of knowledge — and an
internal-scoped `wiki:` row is a duplicate of a row that already exists. That is the argument
for eventually pruning them rather than marking them, which today's mechanism cannot do.

## The wiki is not consumer material, and that is not a gap

Read end to end, the best consumer candidates are all written for an internal reader:
`take-rate-ladder` (*"all four streams stack on one customer"*), `dragondash` (*"the profit
engine — premium margins"*), `trust-then-flag-model` (*"MVPs over-gate"*), and even
`campaign-lifecycle` — the cleanest page in the set — lists DB tables and a trigger name.

Consumer product knowledge belongs in `help_articles` and `/help` (see
[[Help Center & Donny Guidance]]), which is what users actually read.

**The sharpest measurement:** after the fix, the consumer predicate returns **0 of 247** rows —
every non-wiki row was already internal. Consumer Donny's entire RAG *was* the 107 leaking
pages. There was never a legitimate consumer knowledge base to lose, and `agents/general.ts`
already degrades gracefully (`"No additional context available."`).

## Known Issues / Gotchas

- **A stale `CONSUMER` entry is not fully safe, despite the inverted default.** The script never
  deletes, so a renamed allowlisted page's OLD row survives at its old `source_id` with its old
  scope — consumer-retrievable with stale content. The guard names the entry and exits 1 but
  deliberately **does not abort**: the orphan is in the DB whether the run aborts or not, and
  aborting would add 111 stale pages to the problem. A prune is the real remedy;
  `donny-knowledge-sync` exposes no delete-by-source_id, only the archived-doc path. Not
  allowlist-specific — renaming *any* wiki page orphans its row. Prod was clean 2026-08-10
  (disk 112 = DB 112).
- **Sending `scope:"internal"` has a side effect beyond the column.** In `donny-knowledge-sync`,
  an internal page with no `full_content` also reads `internal_docs.archived_at` for its
  `metadata.path`, and an **archived** doc gets its `donny_knowledge` row DELETED instead of
  upserted. That branch went from 5 pages to 112. Prod holds 114 `docs/wiki/%` paths with **0**
  archived, so it is a no-op today and the behaviour you want later — archiving through
  `internal_doc_archive()` now also prunes the consumer row.
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
