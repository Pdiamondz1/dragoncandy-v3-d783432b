---
title: Context Tax
type: concept
created: 2026-07-19
updated: 2026-07-19
sources: [2026-07-19-context-tax-split.md]
tags: [claude-code, knowledge-layer, workflow, tokens, project-context]
---
# Context Tax

The **context tax** is what every Claude Code session on DragonCandy pays before it reads a
line of code: `CLAUDE.md` plus its four `@`-imports, loaded into every turn. It was measured
at **~45,700 tokens** on 2026-07-18 and cut to **~19,000–20,000** by splitting
`docs/PROJECT_CONTEXT.md` §5 (PR #294).

## The shape of the problem

§5 was titled "Active Workstreams" but held **68 multi-paragraph prose bullets, most describing
already-shipped work** — a changelog wearing a workstream label, and **65% of the whole session
tax** on its own.

The mislabel mattered more than the length, because it made the cost **compounding rather than
static**: two separate instructions — `knowledge-sync` step 4 *and* the `CLAUDE.md` "Knowledge
update on branch finish" clause — told every session to append detail there. Each shipped branch
added ~440 tokens, permanently, to a file loaded into every future session.

## The split

- **`docs/SHIPPED_LOG.md`** holds the full prose, newest-first, moved **verbatim**. It is
  deliberately **not** imported by `CLAUDE.md`, so it never auto-loads — but it *is* collected by
  `sync-internal-docs.mjs` (a non-recursive `docs/*.md` glob), so it reaches
  `/internal/strategy` and Internal Donny's RAG with no script change, seeded `is_core=true`.
- **§5 became a three-section index**: `### In flight` / `### Built — awaiting founder go-live`
  (each carrying a `**Pending:**` clause) / `### Shipped`. Entry format is binding:
  `- **<Name>** — <one clause>. → <pointer> · <refs>`, wiki page beating spec, refs omitted
  entirely when neither a PR nor a branch exists.
- **Both generators were amended in the same PR.** This is the part that makes it stick;
  everything else was one-time cleanup. `CLAUDE.md` is the load-bearing half because it is
  itself always-loaded — a session that never opens the skill file would otherwise re-bloat §5.

Result: **176,620 → 73,742 bytes (−58%)**, and growth per shipped branch from ~440 tokens to
~15 (one index line).

## Key Decisions

1. **Move, don't summarize.** Relocating prose byte-for-byte made "no information loss"
   mechanically verifiable instead of a judgment call, and removed any need to author wiki pages
   before migrating.
2. **Fix the generator, not just the output.** Treated as the point of the work, not a follow-up.
3. **Fail toward visibility on pending work.** Where it was unclear whether a founder step
   remained, the entry stayed in "Awaiting" and went onto a PR checklist rather than being
   silently filed as shipped.
4. **No third-party tooling.** The source material also recommended RTK (tool-output compression)
   and pxpipe (text-as-images); both were rejected because this repo carries prod Supabase
   service-role and Stripe credentials, and a plugin intercepting tool output is not a dependency
   worth taking on for a token saving.

## Standing rule — snapshots vs status

**`SHIPPED_LOG.md` entries are historical snapshots, not current status.** A "founder go-live
pending" note records what was true when written. **§5 is the authority on current status**;
where the two disagree, §5 wins. The rule is stated in the log's own header, and exists because
Codex flagged exactly this ambiguity (its specific finding was a false positive — it reasoned
from the moved prose rather than prod — but the ambiguity underneath was real).

## Known Issues

- **Verification gates must compare content, not structure.** The first zero-loss gate counted
  `^- ` bullet *headings*, so it returned 68/68 whether the prose survived or was truncated to
  first lines — the prose lives in indented continuation lines. Two further traps, both of which
  make a gate **false-fail on a correct migration** (dangerous, because the natural response is to
  loosen the gate until it passes): normalize line endings **before** any end-anchored regex, never
  after (this repo is CRLF, so `---END-HEADER---\r` never matches `/^---END-HEADER---$/`, and an
  unmatched `addr2` in `sed '1,/re/d'` deletes through EOF); and terminate an `awk` range at its
  sentinel rather than filtering one line (the `**Workflow discipline**` block is three
  column-0 lines, and is an operating instruction that must stay in §5).
- **`docs/SHIPPED_LOG.md` exceeds `MAX_EMBED_CHARS = 24_000`.** It is fully readable at
  `/internal/strategy` but only its newest ~20% is *embedded* for semantic retrieval. Newest-first
  ordering is deliberate so that window covers recent work. Not a regression —
  `PROJECT_CONTEXT.md` was already truncated identically at ~131KB, and the split restored full
  embedding coverage for `PROJECT_CONTEXT.md` itself.
- **The Dezzy content playbooks still ground on §5.** `dezzy-content-calendar` and
  `dezzy-website-updates` read §5 for "recently shipped features" under a strict non-fabrication
  and "if nothing shipped, stop" rule; post-split they see one-liners. Both are report-only and
  founder-reviewed. Pointing them at `SHIPPED_LOG.md` needs a seed migration — open follow-up.
  The Dezzy Press & Events scout and the Strategy Library audit were already updated.
- **Always-loaded shared docs are high-contention.** `origin/main` moved five times during this
  branch. Land changes to them fast, and re-diff against **all** of `origin/main`'s §5 rather than
  the conflict region — a first resolution pass caught one concurrent PR's new bullet and missed
  another's.

## Evidence over assumption

The migration repeatedly turned up documented state that prod contradicted. Three "pending"
entries were retired on live evidence (`dre_config.go_live_at` and `DRAGON_REWARDS_ENABLED`
sharing an identical `updated_at`; web-tool rows in `donny_cost_ledger`; three edge functions
ACTIVE), one §5 line raised an **already-closed** security follow-up as open
(`match-creators`' `profile_visibility` filter, present since PR #247), and one item was
classified pending because `aios_playbook_runs` had no rows — though the cloud runner writes
none and had been live for four weeks.

The rule that falls out: **a status claim in a document is a claim, not a fact.** Verify against
the system before acting on it, and prefer keeping an uncertain item visible over silently
resolving it.

## First real-world test

Fifteen minutes after PR #294 merged, an unrelated session shipped PR #299, ran its
knowledge-sync, and wrote **+33 lines of prose to `SHIPPED_LOG.md` and a single 4-line index
entry to §5** in the exact binding format — with no knowledge of the originating conversation.
The amended `CLAUDE.md` clause worked on a cold session, which is the only test that matters for
a generator fix.

## See Also

- [[Loop Memory Protocol]] — the same "encode the correction where the next run will read it"
  principle, applied to skills rather than core docs
- [[Self-Improving App]] — the wider knowledge layer this feeds
- [[Validator Skills]] — the `{done,checklist,missing}` contract `verify-knowledge` uses to judge
  whether this layer is current
- [[AIOS Runtime Spend Source of Truth]] — the `ai-cost-vs-cap` verdict whose unattended runner
  was scheduled in the paired PR #295
