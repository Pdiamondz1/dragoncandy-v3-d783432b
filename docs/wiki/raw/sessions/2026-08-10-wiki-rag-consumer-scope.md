# Session: Donny's consumer RAG was 107 leaking wiki pages and nothing else

Date: 2026-08-10
Branch: `fix/wiki-sync-consumer-scope` → PR #434 (`669b259b`, squash-merged)
Follow-up docs branch: `docs/wiki-sync-consumer-scope`
Prior analysis: `.claude/handoffs/2026-08-10-wiki-sync-cleanup.md` (step 1 of 4)

## What shipped

`supabase/scripts/sync-wiki-to-donny.mjs` now marks **every** wiki page
`scope:"internal"` unless its exact `<dir>/<filename>` appears in a new `CONSUMER`
allowlist — which is **empty**. The two denylists it replaced (`EXCLUDE`,
`FORCE_INTERNAL`) are gone. Adds `SYNC_DRY_RUN=1`. The regression test
`src/lib/wikiSyncForceInternal.test.ts` became `src/lib/wikiSyncConsumerScope.test.ts`.

## The reported defect

`EXCLUDE` (19 pages) was gated on `SYNC_CURATE=1`. The sync that actually runs
unattended — `npm run sync:wiki`, fired by the `post-merge` hook — never sets it. So
all 19 pages synced to the **consumer** RAG at `scope null` on every merge. The
script's own comment said this verbatim; `FORCE_INTERNAL` was created as the fix and
the 19 stale entries were simply never moved.

Verified on prod before the change: 112 wiki rows, **107 at `scope NULL`**, 5 internal.

## The two findings that changed the fix

**1. Every wiki page already exists twice in `donny_knowledge`.**
`sync-internal-docs.mjs` writes an `internal-<dir>:<slug>` copy of the same page at
`scope='internal'`. Measured 1:1 on prod — 112 wiki pages, 112 internal copies. So the
`wiki:` rows exist **only** to populate the consumer scope, and marking one internal
costs internal Donny nothing. This was not in the handoff and it reframes what
"mark internal" means: it is purely a *removal from consumer reach*, never a loss.

**2. The worst page was on neither list, and the retrieval path is live.**
`donny-orchestrator/index.ts` calls `retrieveContext(supabase, query, embedding, 5)` at
the default `consumer` scope and passes the chunks to `agents/general.ts` — the
catch-all for greetings and open questions. So "what is DragonCandy?" could retrieve
`entities/dragoncandy-platform`, which states verbatim: *"Pre-revenue: ~30 organic
users, $0 paying, ~$390/mo operating cost (Lovable $50, Anthropic $200, Outstand $67,
Supabase $45, OpenAI $25)"* and *"Stripe Connect (test mode)"*.

That page was in no list because a **denylist fails open** — it holds only what someone
thought to enumerate.

## Why the whole wiki went internal rather than a curated split

The founder's call, made after reading the candidates. Reading the best consumer
candidates end to end showed none are written for a customer:

- `take-rate-ladder` — *"incentivizing upgrades… all four streams stack on one customer"*
- `dragondash` — *"the profit engine — rush content delivery at premium margins"*
- `trust-then-flag-model` — *"MVPs over-gate… gating slowed go-live"*
- `campaign-lifecycle` — the cleanest page in the set, still lists DB tables and a trigger name

The wiki is an engineering and founder notebook. Consumer product knowledge lives in
`help_articles` and `/help`, which is what users actually read.

## The sharpest number

After the sync, the **consumer predicate returns 0 rows out of 247** across the whole
`donny_knowledge` table — every non-wiki row was already internal. So consumer Donny's
entire RAG *was* the 107 leaking pages. He never had a legitimate consumer knowledge
base; the leak was the whole of it. Degradation is nil and `agents/general.ts` already
handles empty (`"No additional context available."`).

## Design calls worth keeping

- **The staleness guard survives but no longer throws.** Under a denylist a stale entry
  meant a page was about to be published to consumers, so refusing to sync prevented it.
  Under an allowlist the renamed file is already in the scan under its new name and syncs
  as internal, so aborting all 112 pages would prevent nothing. It names the entries,
  syncs, exits 1 — matching the oversized-page check's existing precedent in the same file.
- **Its limitation is stated in the code.** The script never deletes, so a renamed
  allowlisted page's OLD row survives at its old scope, consumer-retrievable with stale
  content. Aborting does not fix that (the orphan is in the DB either way). A prune is the
  real remedy and `donny-knowledge-sync` exposes no delete-by-source_id. Not
  allowlist-specific: renaming any wiki page orphans its row. Prod clean 2026-08-10
  (disk 112 = DB 112).
- **`SYNC_DRY_RUN=1`** prints the split without POSTing, so a `CONSUMER` edit is checkable
  before it reaches prod.

## Checked rather than assumed

112 pages now take `donny-knowledge-sync`'s `scope === "internal"` branch instead of 5.
That branch also reads `internal_docs.archived_at` and **deletes** the `donny_knowledge`
row if archived. Prod holds 114 `docs/wiki/%` paths in `internal_docs` with **0**
archived → no-op today, and the desirable behaviour later (archiving a doc now also
prunes its consumer row).

## Codex second review — 2 findings round 1, both mine, clean round 2

- **P1 (real break I caused).** `src/lib/wikiSyncForceInternal.test.ts` parses the script
  for `const FORCE_INTERNAL = new Set(...)` and **throws at module load** if absent, so
  deleting the denylist turned a guard into a red suite. I had grepped for `SYNC_CURATE`
  and never for `FORCE_INTERNAL` — precisely the sweep that test existed to survive.
- **P2 (false claim in my own comment).** It said a stale allowlist entry leaves a page
  "MORE protected than intended, never less". Untrue: the orphaned old row keeps its old
  scope. Codex's suggested remedy (abort before POSTing) does **not** fix its own finding —
  the orphan is already in the DB — so the fix was to correct the claim and record the real
  limitation, not to change the behaviour.

The rewritten test asserts the load-bearing line itself (`else { page.scope = "internal" }`)
and was **proven live**: stubbing that branch turns it red. It also fails if a denylist is
reintroduced, matched on **declarations not mentions**, so the script's comments can keep
narrating why both dead lists were removed.

## Verification (post-merge, prod)

| Check | Result |
|---|---|
| `select coalesce(scope,'NULL'), count(*) … where source_id like 'wiki:%'` | `internal` **112**; NULL group **absent** (was 5 / 107) |
| Consumer predicate `scope is null or scope <> 'internal'` over all 247 rows | **0** |
| `match_donny_knowledge` body on prod | consumer branch is `dk.scope IS NULL OR dk.scope <> 'internal'` → same 0 |
| `npm run sync:wiki` | `inserted=0 updated=112 errors=0 skipped=0` |
| Suite / typecheck / build | 238 files, 2373 tests pass; both clean |

## Gotchas discovered

- **A `git stash push` to check a lint baseline reverted live work.** Recovered by SHA via
  `git stash list --format='%H %gs'` → `git stash apply <sha>` → `drop`. The two other
  sessions' stashes were untouched. Do not stash to answer a question a `git diff` answers.
- **`origin/main` moved twice mid-session** (#430/#431, then #433) in a repo with 30+
  worktrees. Neither collided, but `mergeStateStatus: BEHIND` required a rebase.
- **`Supabase Preview` reported `fail` on the first CI run and `skipping` after the rebase** —
  branch-creation noise, not a gate. It is `skipping` on docs-only PRs because they do not
  touch `supabase/`.
- **The sync key lives only in the main checkout** (`supabase/scripts/.env.sync.local`,
  gitignored). Copying it into the worktree with an absolute source path lets a
  worktree-isolated session run `npm run sync:wiki` without `cd`-ing into the main checkout
  (which locks both shells for the session). Delete the copy afterwards.

## Still open (handoff steps 2–4)

- **Splits.** `donny-social-tools` 26,847 · `service-role-data-exposure` 26,779 ·
  `donny-first-dashboard` 24,708 (gained two PRs this week) · `domain-migration-io-to-com`
  25,086 — all against `FAIL_CHARS = 31_000`, where an oversized page is skipped and the run
  exits 1. **The `FORCE_INTERNAL` split-trap is now gone** — with `CONSUMER` empty, no split
  can break a path-keyed guard.
- `analyses/` heading-derived junk filenames; `index.md` (164 KB) / `log.md` (216 KB) trimming.
