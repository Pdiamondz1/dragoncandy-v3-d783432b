---
name: autoresearch
description: "Autonomous research loop that grows the DragonCandy wiki (and, later, Donny's knowledge). Use for '/autoresearch', 'research <topic> into the wiki', or 'run autoresearch loop'. On-demand mode researches one topic (web + repo), verifies it, and files a wiki page. Loop mode auto-detects wiki gaps and researches them until a budget is spent. Foundation of the self-improving 'smart app' architecture."
---

# Autoresearch

An autonomous research loop that improves the DragonCandy knowledge base over time.
It is a domain-swap of Andrej Karpathy's `autoresearch` pattern (`/autoresearch/program.md`
in this repo) — Karpathy himself calls that file "essentially a super lightweight skill."

Karpathy's loop edits `train.py` to lower `val_bpb`. **This loop researches a knowledge gap,
verifies it, and ingests it into the wiki** at `docs/wiki/`. The wiki is the artifact that
improves each iteration, the way the model improves in his version.

This skill **orchestrates two existing skills** — do not reimplement them:
- **`deep-research`** — fan-out web search, fetch sources, adversarial claim verification, cited synthesis.
- **`wiki-ops`** — the 8-step ingest flow, query, and lint over `docs/wiki/`. Read its skill and
  `docs/KNOWLEDGE_WIKI.md` before writing pages.

Read `docs/wiki/index.md` before any run so you know what already exists ("compound, don't duplicate").

## Research domains

Every finding is one of three domains — classify it, because it routes to a different wiki bucket:

| Domain | Typical sources | Wiki home |
|--------|-----------------|-----------|
| **technical / architecture** | repo: `src/`, `supabase/functions/`, `docs/`, `.claude/handoffs/` | `entities/`, `concepts/` |
| **competitive / market** | external web (rivals, market data, benchmarks) | `sources/`, `analyses/` |
| **business / strategy / KPI** | internal strategy docs (`PROJECT_CONTEXT.md`, Moat Playbook, Stripe prices) + external benchmarks | `analyses/`, `concepts/` |

Both source types are in scope on every run: external web **and** internal repo/docs mining.

## The acceptance gate (the `val_bpb` analog)

Karpathy keeps a change only if `val_bpb` improved. Here, a finding is **kept** only if **all** hold:

1. **Fills a real gap** — not already covered by an existing page (check `index.md` first).
2. **Verified** — backed by **≥2 independent external sources**, *or* grounded directly in repo
   code/docs with concrete file paths.
3. **Non-contradictory** — or the contradiction with an existing page is **explicitly flagged** in
   the page (never silently overwrite — wiki rule).

Otherwise the outcome is **discarded** (fails 1 or 2) or **flagged** (a contradiction to resolve).
Only `kept` findings produce a wiki page. This is what stops the loop from polluting the wiki.

## `/autoresearch <topic>` — on-demand (one pass)

1. **Scope** the topic and classify its domain.
2. **Gather** from both source types:
   - External: invoke `deep-research` (web search → fetch → adversarial verify → cited synthesis).
   - Internal: Grep/Glob/Read over `src/`, `supabase/functions/`, `docs/`, `.claude/handoffs/`.
3. **Gate**: apply the acceptance gate above.
4. **Ingest** (if `kept`): follow the wiki-ops 8-step ingest flow — write the page into the correct
   bucket with valid frontmatter (`title`, `type`, `created`, `updated`, `sources`, `tags`), add
   `[[wikilinks]]` and a `## See Also`, update `index.md` (alphabetical), and append to `log.md`.
5. **Log the outcome** to `docs/wiki/log.md` (see ledger format below) — including discards/flags,
   which produce no page but are still recorded.

## `/autoresearch loop [N]` — autonomous (Karpathy adaptation)

> **Validated in Slice 2 — documented here so the skill is complete. Slice 1 ships on-demand only.**

**Setup:** confirm scope and set an **iteration budget** `N` (default 8; `loop 20` overrides). The
loop is autonomous *within* the budget, then stops and summarizes. The budget is the cost bound.

**LOOP** (until budget exhausted or the user interrupts):

1. Run the wiki-ops **`lint`** check. Rank gaps: missing concept pages referenced by `[[wikilinks]]`,
   orphan pages, thin/single-source coverage, stale claims.
2. Pick the highest-value gap as this iteration's "experiment."
3. Research it (web + repo, exactly as on-demand).
4. Apply the **acceptance gate** → `kept` / `discarded` / `flagged`.
5. If `kept`, ingest via wiki-ops; else record the reason. Append a ledger line to `log.md`.
6. **Do not pause to ask permission mid-budget** (Karpathy's "NEVER STOP" — but bounded by `N`).

**On exhaustion:** print a results summary — gaps closed, pages created/updated, items flagged,
iterations spent.

## Results ledger (the `results.tsv` analog)

Every iteration — kept, discarded, or flagged — appends to `docs/wiki/log.md`:

```
## [YYYY-MM-DD] autoresearch | <gap or topic>
Status: kept | discarded | flagged
Domain: technical | competitive | strategy
Sources: <urls / file paths used>
Pages created: [[Page]]   (omit if none)
Pages updated: [[Page]]   (omit if none)
Note: <one line — why discarded/flagged, or what was learned>
```

## `/autoresearch sync-donny [staging|prod]` — teach Donny (Phase 2)

Pushes verified wiki knowledge into Donny's RAG store so the product reasons over it — the second
learner on the same loop. Donny retrieves it automatically through the existing
`match_donny_knowledge` path; no retrieval change is needed.

- **Scope:** only `concepts/`, `entities/`, `analyses/`. **Never** `raw/`, `sources/`, session pages,
  `index.md`, or `log.md` (too granular/noisy for retrieval).
- **How:** for each in-scope page build `{ source_id: "wiki:<path-without-.md>", content: "<title>\n\n<body>",
  metadata: { title, type, path, tags } }` and POST batches (≤100) to the **`donny-knowledge-sync`**
  edge function. It embeds via OpenAI `text-embedding-3-small` (1536d) and **idempotently upserts** one
  row per page keyed on `metadata.source_id` (re-sync updates, never duplicates).
- **Auth / target:** the function is **service-role only**. The operator supplies the target function
  URL + service-role key via env (never commit a key). **Default target is `staging` — promote to
  `prod` only after verifying Donny retrieves wiki knowledge correctly.**
- **Cost:** embedding spend is logged to `donny_cost_ledger` (model `text-embedding-3-small`), so it
  counts against the 15%-of-revenue AI cap.

This is the **only** place the loop writes outside `docs/wiki/`, and it writes **only** to
`donny_knowledge` through the gated edge function — never app code, schema, or other tables.

## Hard guardrails

- **Writes only to `docs/wiki/`.** Never edit app code, schema, RLS, or auth. Never touch
  `docs/wiki/raw/` (immutable sources). A code or bug-fix idea is written as a wiki *proposal*
  page for human review — consistent with "one change per prompt," "never modify auth without
  confirming," and Musk's-algorithm "automate last."
- **No metered spend.** This runs in the user's Claude Code session, not through the edge functions,
  so it sits outside the 15%-of-revenue AI cap. The iteration budget bounds cost.
- **Flag, don't overwrite.** Contradictions are surfaced explicitly, never silently resolved.
- **Flags stay in the wiki — do not fold them into codebase docs.** When the loop surfaces an
  *empirical* claim about code or data (a possible bug, schema-vs-reality mismatch, migration drift,
  or "schema-only" feature), record it as a **wiki flag** on the relevant page and **verify it**
  (live DB via Supabase MCP, repo via Grep). Resolve/reclassify the flag **in place** on the wiki
  page — never edit `DATABASE_SCHEMA.md`, `PROJECT_CONTEXT.md`, or other codebase docs to assert a
  finding that hasn't been confirmed, and never write a code fix from this loop (that is a separate,
  human-gated, non-wiki change). The *only* exception is an **editorial** ambiguity in a
  human-owned strategy doc (e.g. an unstated unit or scope) — those may be folded into that doc, and
  only after the human decides. Empirical → verify in the wiki; editorial → human decides, then fold.

## Roadmap (recorded in `docs/wiki/concepts/self-improving-app.md`)

- **Phase 1 (now):** this loop → grows the wiki across the three domains.
- **Phase 2 — Donny learns** *(built, staging):* `sync-donny` mode + the `donny-knowledge-sync` edge
  function push verified pages into `donny_knowledge` (RAG, OpenAI embeddings, RLS-safe, metered) —
  dual output, one loop: wiki for humans, Donny's RAG store for the product. See the section above.
- **Phase 3 — telemetry→wiki bridge:** real app signals (`analytics_events`, `dragonshare_events`,
  edge-function/error logs, Supabase advisors) drive gap detection — "learn about bugs from usage."
- **Phase 4 — fix proposals:** verified-bug remediation specs / draft PRs, human-gated, never auto-merged.
- **Phase 5 — KPI/milestone autopilot:** maintain a living strategy/KPI/milestone page against the
  three-year targets and kill-switches in `PROJECT_CONTEXT.md`; flag when a kill-switch nears.
