# Session — Context-tax split: PROJECT_CONTEXT §5 → index + SHIPPED_LOG (PRs #294, #295)

**Date:** 2026-07-18/19
**Branches:** `chore/context-tax-reduction` (#294), `chore/triage-schedule-routines` (#295)
**Scope:** docs + skills + cloud routines. No `src/`, schema, RLS, edge function, or secret change.

## What prompted it

A founder-supplied YouTube video ("Paste This Into Claude, Never Hit a Token Limit Again",
Austin Marchese) was **audited against the repo before adopting** — the same posture used for
the agent-loop audit that produced `read-the-traces`. Of its ten techniques, three applied,
six did not, and one was actively rejected.

Adopted: audit `/context`, treat `CLAUDE.md` as a **directory, not a document**, keep it near
~200 lines. Rejected with reasons: **RTK** (a third-party tool that intercepts tool output —
unacceptable in a repo carrying prod Supabase service-role and Stripe credentials), **pxpipe**
(text-as-images; lossy and the author concedes it may be patched), the **Caveman plugin**
(degrades founder-facing reporting), **engine-swap to GLM/DeepSeek** (conflicts with the Opus
4.8 campaign-generation requirement), and **local models** (the source itself advises against
it today).

Getting the video's content was itself a small saga: YouTube's caption API is now PO-token
gated, in-page `timedtext` returns 200-with-zero-bytes, the InnerTube `get_transcript` endpoint
returns `FAILED_PRECONDITION`, and three third-party transcript services were blocked (App
Check / Cloudflare / 522). `yt-dlp` retrieved the official auto-caption track in seconds.
**Durable:** when a transcript is needed and the caption track exists, `yt-dlp` beats both
browser automation and the real-time `media-ingest` audio-capture path.

## The problem (measured, not estimated)

Every session loaded `CLAUDE.md` + its four `@`-imports before reading a line of code:

| Always-loaded | ~Tokens |
|---|---:|
| `PROJECT_CONTEXT.md` **§5 alone** | **~29,950** |
| everything else | ~15,750 |
| **total per session** | **~45,700** |

§5 was titled "Active Workstreams" but held **68 multi-paragraph prose bullets, most describing
already-shipped work** — a changelog wearing a workstream label. **65% of the entire session
tax.**

It was also **compounding**: `knowledge-sync` step 4 *and* `CLAUDE.md` line 162 independently
told every session to append detail there, so it grew ~440 tokens per shipped branch, forever.

Coverage was verified per-bullet before designing: **58 of 68 already cited a wiki page or spec**
(28 concepts, 45 specs, all present on disk). §5 was largely a prose cache of content the wiki
already held.

## What shipped

**PR #294 — the split.**
- `docs/SHIPPED_LOG.md` (new): all bullets moved **verbatim**, newest-first. Not imported by
  `CLAUDE.md`, but auto-collected by `sync-internal-docs.mjs` (non-recursive `docs/*.md` glob),
  so `/internal/strategy` and Internal Donny keep it. Seeded `is_core=true`.
- §5 → a **three-section index**: `### In flight` / `### Built — awaiting founder go-live`
  (each carrying a `**Pending:**` clause) / `### Shipped`. Entry format
  `- **<Name>** — <one clause>. → <pointer> · <refs>`; wiki page beats spec; refs omitted
  entirely when neither PR nor branch exists.
- **Both generators amended** — `knowledge-sync` step 4 and the `CLAUDE.md` "Knowledge update on
  branch finish" clause. `CLAUDE.md` is the load-bearing half: it is itself always-loaded, so a
  session that never opens the skill file would otherwise re-bloat §5.
- Result: **176,620 → 73,742 bytes (−58%)**; growth per branch ~440 tok → ~15 tok.

**PR #295 — triage reconciliation.** Worked the founder checklist; Awaiting go-live 6 → 2.
Scheduled three report-only cloud routines from their committed `.claude/schedules/` prompts:
`ai-cost-vs-cap` playbook runner (weekly Mon 13:00 UTC), Dezzy Press & Events scout and
Strategy Library audit (both monthly). Two prompts were told shipped detail now lives in
`SHIPPED_LOG.md`, and the library audit was explicitly told that file's size and wiki overlap
are **by design** so it does not file it as `strategy-bloat` every month.

## Key decisions

1. **Move, don't summarize.** Prose relocated byte-for-byte, making "no information loss"
   mechanically verifiable instead of a judgment call — and removing any need to author wiki
   pages first.
2. **Fix the generator, not just the output.** Trimming §5 without amending both instructions
   buys weeks. This was treated as the point of the work, not a follow-up.
3. **Fail toward visibility on pending work.** When it was unclear whether a founder step was
   still outstanding, the entry stayed in "Awaiting" and went on a PR checklist — never silently
   filed as shipped.
4. **No third-party tooling** in a credential-bearing repo (see rejections above).

## Gotchas (the durable ones)

- **A gate that counts structure proves nothing.** The first zero-loss gate counted `^- ` bullet
  *headings* — it returned 68/68 whether the prose survived or was truncated to first lines. The
  prose lives in indented continuation lines. Fixed to a **sorted non-blank line diff**.
- **Normalize line endings BEFORE any end-anchored regex, never after.** The repo is CRLF;
  `---END-HEADER---\r` does not match `/^---END-HEADER---$/`, and an unmatched `addr2` in
  `sed '1,/re/d'` deletes through EOF — so the gate reports *total data loss on a correct
  migration*. The danger is an implementer then "fixing" the gate by loosening it.
- **Terminate an awk range at a sentinel; don't filter one line.** The `**Workflow discipline**`
  block at §5's end is **three** lines, all at column 0, and is an *operating instruction* that
  must stay in the loaded file. A `grep -v` on its first line orphaned two lines and false-failed
  the gate.
- **Verify status claims against prod, not the doc.** A review moved 3 entries out of the pending
  list on live evidence: `dre_config.go_live_at` and `DRAGON_REWARDS_ENABLED` share an identical
  `updated_at` (both launch switches thrown in one transaction, 2026-06-28); 7 `web_search`/
  `web_extract` rows exist in `donny_cost_ledger`; `wiki-merge-pr` v3 / `wiki-import-doc` v4 /
  `google-workspace-proxy` v21 are all ACTIVE.
- **A false security alarm is worse than an omission.** §5 claimed `match-creators` still needed
  its `profile_visibility='public'` filter. It is present at `index.ts:421` and `:428` (shipped in
  PR #247). The line was removed. This was twice reported upward as a live privacy gap before
  being checked.
- **Absence of a run row is not absence of a run.** `kill-switch-watch` was classified pending
  partly because `aios_playbook_runs` showed only manual runs — but the cloud runner posts
  findings directly and writes no runs row. It had been live weekly since 2026-06-21.
- **`origin/main` moved five times mid-branch.** Always-loaded shared docs are high-contention.
  Re-diff against **all of `origin/main`'s §5**, not the conflict region: a first resolution pass
  caught only PR #293's new bullet and missed PR #292's — the zero-loss gate failed loudly and
  named the exact missing prose, and it was recovered.
- **A branch lacking a commit looks identical to a branch reverting one.** `git diff origin/main`
  showed phantom "deletions" of `read-the-traces` twice; both times the cause was the branch being
  one commit behind, not a revert.

## Verification

Zero-loss gate: sorted-line diff empty at **1342/1342** lines (1277 before two concurrent PRs
landed). Citation integrity: unchanged path set. Structure: heading + three-line
`**Workflow discipline**` block intact, 70 entries, 2 `Pending:` clauses after reconciliation.
`npm run build` green. Reviews: per-task spec+quality, a whole-branch review ("ready to merge"),
and **Codex clean** — its one P2 was a verified false positive (it reasoned from the moved
historical prose rather than prod), but the ambiguity underneath was real and produced the
`SHIPPED_LOG.md` header rule below.

## First real-world test — it held

Fifteen minutes after #294 merged, an unrelated session shipped PR #299 and ran its
knowledge-sync: **+33 lines of prose to `SHIPPED_LOG.md` and a single 4-line index entry to §5**,
in the exact binding format, with no knowledge of the originating conversation. The amended
`CLAUDE.md` clause did its job on a cold session.

## Standing rule established

**`SHIPPED_LOG.md` entries are historical snapshots, not current status.** A "founder go-live
pending" note records what was true when written. **§5 is the authority on current status**;
where the two disagree, §5 wins. This is stated in the log's own header.

## Affected files

`docs/PROJECT_CONTEXT.md` (§5 + §10), `docs/SHIPPED_LOG.md` (new),
`.claude/skills/knowledge-sync/SKILL.md` (step 4) + `MEMORY.md` (new `[context-tax]` Lesson),
`CLAUDE.md` (one clause). Specs:
`docs/superpowers/specs/2026-07-18-context-tax-reduction-design.md`; plan:
`docs/superpowers/plans/2026-07-18-context-tax-reduction.md`.
