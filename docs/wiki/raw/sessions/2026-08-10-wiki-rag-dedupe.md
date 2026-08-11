# Session: the wiki was syncing a second copy of itself

Date: 2026-08-10
Branch: `fix/wiki-sync-dedupe` → PR #437 (`63862a23`, squash-merged)
Follows: #434 (consumer scope closed) and #435 (its knowledge-sync)

## What shipped

`sync-wiki-to-donny.mjs` now syncs **only** the pages listed in `CONSUMER` (currently none)
instead of sending every page and marking non-listed ones `internal`. The 113 duplicate
`wiki:` rows were pruned from prod. `sync-internal-docs.mjs` got the same `process.exitCode`
fix found en route.

## Why #434's fix was right about direction and wrong about volume

#434 closed the leak by marking every non-allowlisted page `scope:"internal"`. But
`sync-internal-docs.mjs` **already** syncs the whole `docs/wiki/` tree as
`internal-<dir>:<slug>` at internal scope (its `WIKI_DIRS`), and `wiki-merge-pr` writes that
same namespace through `_shared/wiki-sync-payload.ts` (`source_id: internal-${folder}:${slug}`,
`scope: 'internal'`).

So the internal copy has **two** writers, `sync-wiki-to-donny.mjs` has one, and the `wiki:`
namespace exists for exactly one purpose: the consumer scope — which is empty.

Measured on prod: **113 pages embedded twice, 109 byte-identical** (only the 4 pages over
`MAX_EMBED_CHARS` differed, because the internal copy truncates the embed there). Consequences:
internal Donny could spend two of its five RAG slots on one page; every sync paid double the
embedding cost; and the duplicate was the **only** copy subject to this script's hard
`FAIL_CHARS` skip — which is what had queued four pages for splitting.

| | `internal-<dir>:<slug>` | `wiki:<dir>/<slug>` |
|---|---|---|
| Writers | `sync-internal-docs.mjs` + `wiki-merge-pr` | `sync-wiki-to-donny.mjs` only |
| Oversize | embeds first 24,000, full markdown kept in `internal_docs` | hard skip at 31,000, exit 1 |
| Serves | internal Donny + `/internal/strategy` | the consumer scope — 0 pages |

The asymmetry exists because the truncate-embed trick needs `full_content`, which
`donny-knowledge-sync` rejects on anything but internal scope — and a consumer page is by
definition not internal scope.

## The property this change cost, and what pays for it

Sending every page made the script **self-healing**: drop a page from the allowlist and the next
run overwrote its row back to `internal`. Sending only allowlisted pages loses that — a removed
page is simply never sent again, so its row strands at `scope null`, consumer-retrievable,
forever. That is precisely the shape `EXCLUDE` had, and the lesson from `EXCLUDE` is that **a
rule living only in a comment does not hold**.

So the rule got a check: a **read-only** GET diffs the `wiki:` rows in `donny_knowledge` against
the allowlist, names any orphans **with their actual scope**, prints the prune SQL, and carries
the count into the exit code.

- **Read-only on purpose.** Giving a sync script `DELETE` on `donny_knowledge` has a worse blast
  radius than the drift it fixes.
- **Fails open** on a REST/permission error — the sync did not create the drift, so a blip must
  not fail an otherwise good run.
- Skipped under `SYNC_DRY_RUN`, which is offline by contract.

## Two defects found by RUNNING it, not reasoning about it

1. **The orphan message overclaimed.** It asserted the rows were "still consumer-retrievable";
   they were at `scope internal`, so it was false — the same defect Codex caught in #434. Now it
   reports each row's real scope and says plainly when none are a live exposure.
2. **`process.exit(1)` was silently replaced by a crash.** Adding the orphan check's second fetch
   host meant exiting while undici still held a pooled socket → on Windows,
   `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and exit **127**, masking the 1 it
   meant to return. Fixed with `process.exitCode`. This is the same assertion
   `knowledge-sync-automation.md` had documented as "harmless" noise for months — it was never
   harmless, it was eating the exit code. A sweep then found the identical pattern on
   `sync-internal-docs.mjs`'s error path and fixed it too.

## The prune, and the ordering rule it taught

Run behind the `careful` gate. Pre-flight proved 113 rows matched, **0** were at consumer scope
(so this was cleanup, not a leak), and **0** would be lost uniquely (every one had an
`internal-*` mirror). Deleted: 249 → 136.

**Then they came back.** Not a failed delete: the committed `post-merge` hook fired on a main
fast-forward and ran the script **as it existed on `main` at that moment** — the #434 version —
re-inserting all 113. Visible as `inserted=113` in `.git/knowledge-sync.log`.

**Ordering rule: merge the script change first, prune second.** Between the two, any sync from
`main` undoes the prune. And read the hook log before concluding a delete failed.

After #437 merged, the prune was re-run and the merged script verified against prod:
`inserted=0 updated=0 errors=0 skipped=0 orphans=0`, exit 0, and it did **not** re-create them.

## Verification

| Check | Result |
|---|---|
| `donny_knowledge` total | 249 → **136** |
| `wiki:` namespace | **0** |
| Consumer-reachable (`scope is null or scope <> 'internal'`) | **0** |
| `internal-*` wiki mirrors intact | **113** |
| Content probe (`internal_docs.archived_at`) after prune | still retrievable, via the mirror |
| Sync from merged `origin/main` | `errors=0 orphans=0`, exit 0 |
| Suite / typecheck / build | 238 files, **2375** tests; both clean |
| Codex | clean, first round |

A flaky first suite run reported "7 errors / 2307 tests" under machine load (215s vs 91s); the
re-run was clean at 238 files and the count reconciles exactly (2373 + the 2 new assertions).

The PostgREST filter's correctness is proven by the orphan check itself: the same unencoded
`metadata->>source_id=like.wiki:*` request returned all 113 rows **with scopes** before the
prune and 0 after, corroborated independently by SQL. Codex tried to verify that URL encoding and
was blocked by its sandbox policy — the empirical result is stronger evidence than it could have
obtained.

## Consequence for the still-open page splits

`donny-social-tools` (26,847), `service-role-data-exposure` (26,779),
`domain-migration-io-to-com` (25,086) and `donny-first-dashboard` (24,708) were queued for
splitting because of the hard `FAIL_CHARS` skip. **That skip applied to the copy that was just
deleted.** The remaining ceiling is `MAX_EMBED_CHARS = 24,000`, which truncates the embed but
keeps the full markdown in `internal_docs`. So splitting is now a retrieval-quality improvement
(tail coverage of 708–2,847 chars per page, plus more focused retrieval units), not a fix for a
broken sync — a materially smaller payoff than when the handoff queued it.
