# Session Context-Tax Reduction — PROJECT_CONTEXT §5 Split

**Date:** 2026-07-18
**Branch:** `chore/context-tax-reduction`
**Status:** Design — **spec review passed** (rev 4, three review rounds)

## 1. Context & Problem

Every Claude Code session on this repo begins by loading `CLAUDE.md` and its four
`@`-imports before a single line of code is read. That load was measured, not estimated:

| Always-loaded | Lines | Bytes | ~Tokens |
|---|---:|---:|---:|
| `docs/PROJECT_CONTEXT.md` **§5 alone** | 1,291 | 119,797 | **~29,950** |
| `docs/PROJECT_CONTEXT.md` (everything else) | 207 | 9,910 | ~2,480 |
| `CLAUDE.md` | 221 | 14,472 | ~3,620 |
| `docs/DATABASE_SCHEMA.md` | 254 | 15,450 | ~3,860 |
| `docs/DESIGN_SYSTEM.md` | 170 | 12,130 | ~3,030 |
| `docs/KNOWLEDGE_WIKI.md` | 89 | 3,536 | ~880 |
| Skill + agent frontmatter (13 skills, 1 agent) | — | 5,845 | ~1,460 |
| `SessionStart` hook output | 27 | 1,699 | ~425 |
| **Total per session** | | **182,839** | **~45,700** |

**§5 is 65% of the entire tax.** Anthropic's guidance is to keep `CLAUDE.md` near ~200
lines and treat it as *instructions for working on the project*, not documentation. The
combined import set is **2,232 lines**.

### The root cause is a mislabel, not verbosity

§5 is titled **"Active Workstreams"** but contains **68 bullets, most describing work
that already shipped** — averaging ~440 tokens of multi-paragraph prose (largest ≈ 28
lines). It is a changelog wearing a workstream label.

That makes the cost **compounding, not static**. `knowledge-sync` step 4 (SKILL.md
line 49) instructs:

> `docs/PROJECT_CONTEXT.md` — Active Workstreams / Current State (**almost always**).

and `CLAUDE.md` line 162 independently instructs the same thing. So every finished
branch appends another ~440-token bullet, permanently, to a file loaded into every
future session. Trimming §5 once without changing **both** instructions buys a few
weeks.

### The content is already stored elsewhere

Coverage was verified per-bullet:

| §5 bullet has… | Count |
|---|---:|
| Both a `docs/wiki/…` page and a spec | 30 |
| A wiki page only | 15 |
| A spec only | 13 |
| **Neither** | **10** |

**58 of 68 (85%) already cite a durable artifact** — 28 distinct wiki concept pages and
45 distinct specs, all confirmed present on disk. Of the 10 unlinked, 7 are already
one-liners; 3 carry substantial prose (DragonShare, AIOS ingest-secret rotation, QA
staging — and `docs/wiki/concepts/qa-cicd-gate.md` exists, it just isn't linked).

### …but a subset carries unfinished founder actions

Measured separately, because it constrains the design. Two patterns were run (both
stated in §6.3 so the count is reproducible):

| Pattern | Hits | Meaning |
|---|---:|---|
| Narrow (explicit go-live language only) | **13** | High confidence: a founder step is outstanding |
| Broad (adds bare `pending`, `deploys on merge`, `remaining =`) | **21** | Candidate set; contains false positives |

The broad set over-counts: "deploys on merge" is normal Vercel behavior, not a founder
action (§4.1 classifies it Shipped). **Treat 13 as the confident floor and 21 as the
review candidate set** — the final split is per-bullet judgment, not a regex result.

Either way the constraint holds: these are *not* finished work, and moving their prose
out of loaded context without preserving the pending step would silently drop live
to-dos from every future session — a regression worse than the token cost. This is why
§4.1 uses a **multi-way** classification, not two.

Separately, **19 bullets reference explicitly deferred future phases** ("Phase 4
deferred", "designed but deferred", "gated on"). Deferred is *not* pending — §4.1 gives
it its own rule so it cannot inflate the actionable list.

## 2. Decisions (confirmed with the user)

1. **Scope is context cleanup only.** Script-driven skills and minimum-viable-model
   subagents — identified in the same audit — are deferred to separate branches (§9).
2. **Move, don't summarize.** Prose relocates verbatim. This makes "no information
   loss" mechanically verifiable rather than a judgment call, and removes any need to
   author new wiki pages first.
3. **Fix both generators, not just the output.** `knowledge-sync` **and** the
   `CLAUDE.md` clause change in the same PR (§4.3). Otherwise the problem returns.
4. **Fail toward visibility on pending work.** When it is unclear whether a founder
   step is still outstanding, the entry stays in "Awaiting go-live" and is flagged in
   the PR body — never silently filed as shipped.
5. **No third-party tooling.** The source material also recommends RTK (tool-output
   compression) and pxpipe (text-as-images). Rejected: this repo carries prod Supabase
   service-role and Stripe credentials, and a plugin that intercepts tool output is not
   a dependency to take on for a token saving.

## 3. Goals & Non-Goals

**Goals:**
- Cut the per-session always-loaded tax from ~45,700 to **~19,000–20,000 tokens
  (≈−57%)**.
- Restore §5 to its actual name: in-flight and not-yet-live work.
- Preserve 100% of existing prose, verifiably, and keep it reachable by Internal Donny.
- Keep every outstanding founder action visible in loaded context.
- Stop the compounding growth at both sources.

**Non-Goals:**
- No content changes to `DATABASE_SCHEMA.md`, `DESIGN_SYSTEM.md`, or
  `KNOWLEDGE_WIKI.md`. These are genuine per-turn operating instructions — precisely
  what an always-loaded file *should* contain.
- **`CLAUDE.md` is edited in exactly one place** (the line-162 clause, §4.3). No other
  `CLAUDE.md` change. *(Revised from rev 1, which wrongly excluded `CLAUDE.md` entirely
  while depending on that instruction changing.)*
- No new wiki pages (the verbatim move makes them unnecessary).
- No application code, schema, RLS, edge function, or secret changes. **Docs only.**
- No change to what `donny-knowledge-sync` feeds the consumer RAG (`docs/wiki/` only).
- No reconciliation of stale status claims — flag, don't fix (§7).

## 4. Design

### 4.1 Split into index + log

**`docs/PROJECT_CONTEXT.md` §5 becomes an index** with three subsections:

```markdown
## 5. Active Workstreams

### In flight
- **Content delivery system stabilization** — bug-fixing the creator→business content
  handoff and payment flow; gates production launch.

### Built — awaiting founder go-live
- **Dragon Rewards Engine (DRE) v1** — points ledger + award engine + tiers/badges.
  **Pending:** apply both migrations, set Vault `dre_award_engine_url`, deploy
  `dre-award-engine`, set real `go_live_at`, confirm cron.
  → `docs/wiki/concepts/dragon-rewards-engine.md` · PR #196

### Shipped (index — full detail in `docs/SHIPPED_LOG.md`)
- **DragonFeed** — creator-content discovery; mobile vertical feed + creator search.
  → `docs/wiki/concepts/dragon-feed.md` · PR #242, #247
```

**Classification rule (binding, applied per bullet):**

| Condition | Section |
|---|---|
| Work not yet complete | **In flight** |
| Complete, but any founder/deploy step outstanding (migration, edge-fn deploy, secret, `/schedule`, flag flip) | **Built — awaiting go-live**, retaining a `**Pending:**` clause |
| Complete with no outstanding action | **Shipped** (one-liner + pointer) |
| Complete, with an **explicitly deferred / unstarted future phase** ("Phase 4 deferred", "designed but deferred", "gated on X") | **Shipped** — state the deferral in the one-line clause |
| Legacy open-ended bullet with no completion marker and no artifact (e.g. "Dashboard UX polish", "RLS compliance and query optimization", "GTM Capital & CAC Playbook") | **Shipped**, clause phrased as ongoing practice, unless genuinely being worked now |
| Unclear whether a founder step is still outstanding | **Built — awaiting go-live** + flag in PR body (Decision 4) |

Two carve-outs, both binding:

- **"Deploys on merge" is not a founder action** — that is normal Vercel behavior;
  classify as Shipped.
- **Row 2 beats row 4 when both apply.** A bullet can carry an outstanding founder
  step *and* a deferred later phase (DRE v1 is exactly this). It goes to **Awaiting
  go-live**; mention the deferral in the clause. The outstanding action decides
  placement.
- **Deferred is not pending.** 19 bullets reference deferred future phases. Nobody is
  working them and they need no founder step, so they must not land in "Awaiting
  go-live" — that list exists to be acted on, and padding it destroys its usefulness.
  Decision 4's tie-break applies **only** to genuine ambiguity about an outstanding
  *founder/deploy step*, never to deferral.

**Entry format (binding):**

```
- **<Name>** — <one clause: what it is + status>. → <pointer> · <refs>
```

- **`<pointer>` precedence:** wiki concept page if one exists; else the spec; else
  `docs/SHIPPED_LOG.md` (no anchor — see below). When a bullet cites **both**, use the
  **wiki page only** — it is the durable synthesis and itself links the spec.
- **`<refs>`:** `PR #N` (comma-separated if several). If a bullet cites no PR, use the
  branch name in backticks. If neither exists, **omit the ` · <refs>` segment
  entirely** — do not write "n/a".
- **The 3 unlinked bullets** point at `docs/SHIPPED_LOG.md` **without a fragment
  anchor.** *(Rev 1 specified `#<anchor>`; the log is a flat bullet list with no
  headings, so no anchor targets exist. Adding per-entry headings was rejected as
  churn — the file is searchable and the entry name is in the index line.)*
- **`**Pending:**` clause** applies only to the "Awaiting go-live" section; copy the
  outstanding steps from the source bullet, condensed to one sentence.

**`docs/SHIPPED_LOG.md` (new) receives the full prose, moved verbatim**, newest-first,
under a short header (§4.4).

### 4.2 Why a new top-level `docs/*.md` file is the right destination

`supabase/scripts/sync-internal-docs.mjs` (line 76) calls
`collectDir("docs", "internal-doc")` — a **non-recursive** glob of `docs/*.md`. A new
`docs/SHIPPED_LOG.md` is therefore picked up automatically into `internal_docs` →
`/internal/strategy` and Internal Donny's RAG, with no script change. It will also be
seeded `is_core = true` by the existing `BEFORE INSERT` trigger protecting top-level
`docs/*.md` from archival — correct for this file.

**Honest limitation:** line 26 sets `MAX_EMBED_CHARS = 24_000`. Content beyond that is
stored in `full_content` (readable at `/internal/strategy`) but **not embedded**, so
a ~120KB log is largely invisible to *semantic retrieval*. This is not a regression —
`PROJECT_CONTEXT.md` at ~130KB is already truncated identically today, and the split
actually restores full embedding coverage for `PROJECT_CONTEXT.md` itself. But §7 must
not overstate the mitigation, and verification must query a **mid-file** entry (§6).

### 4.3 The compounding fix — both generators

**(a) `.claude/skills/knowledge-sync/SKILL.md` line 49** changes from:

> - `docs/PROJECT_CONTEXT.md` — Active Workstreams / Current State (almost always).

to:

> - `docs/SHIPPED_LOG.md` — **prepend** the session's full entry (almost always).
> - `docs/PROJECT_CONTEXT.md` §5 — **only** when work *starts* (add to In flight),
>   *reaches built-but-not-live* (move to Awaiting go-live with a `**Pending:**`
>   clause), or *fully completes* (move to Shipped as a one-liner + pointer). One line
>   per entry — plus a `**Pending:**` clause for Awaiting go-live entries only. Detail
>   belongs in `SHIPPED_LOG.md` or the wiki. **§5 is an index, not a log.**

**(b) `CLAUDE.md` line 162** ("Knowledge update on branch finish (required)") currently
reads "refresh the affected core docs (`PROJECT_CONTEXT.md`, plus …)". It gains one
clause: session detail goes to `docs/SHIPPED_LOG.md`; `PROJECT_CONTEXT.md` §5 is a
one-line index.

**(b) is load-bearing.** `CLAUDE.md` is itself always-loaded, so a session that follows
it without opening the skill file would otherwise re-bloat §5 — exactly the failure
(a) exists to prevent. This is the single most important change in the spec; everything
else is one-time cleanup.

### 4.4 `SHIPPED_LOG.md` header

A short header declaring: this is an append-only changelog, newest-first; it is
deliberately **not** imported by `CLAUDE.md`; prose duplication with `docs/wiki/` is
intentional. The last point matters because the monthly `strategy-library-audit-agent`
files `strategy-dupe` / `strategy-bloat` findings over `internal_docs` — this header
lets it judge the file correctly rather than re-flagging it every month.

**Required:** the header's final line must be the literal sentinel

```
---END-HEADER---
```

appearing **exactly once in the file**. §6 check (1) splits on it to isolate the moved
body. Omit it and `sed` deletes through EOF, producing an empty comparison file and an
opaque gate failure that looks like total data loss.

## 5. Migration Mechanics

1. **Extract §5 by heading anchor, not line number** — from the line after
   `## 5. Active Workstreams` to the line before `## 6. On the Horizon`, then **exclude
   the trailing `**Workflow discipline**` paragraph**, which is an operating
   instruction and must remain in `PROJECT_CONTEXT.md`. *(Rev 1 used the literal range
   70–1360, which both moved the `## 5.` heading itself and swept up the
   Workflow-discipline block. Absolute line numbers are also invalidated by any merge
   to `main` before this lands — see §7.)*
2. Create `docs/SHIPPED_LOG.md` with the §4.4 header; move the extracted bullets in
   **verbatim**, newest-first.
3. Rewrite §5 per §4.1 — three subsections, binding classification rule, binding entry
   format. Derive each one-liner from the source bullet's own opening clause and its
   existing `Concept:`/`Spec:` citations.
4. Apply both generator edits (§4.3 a and b).
5. Add a one-line pointer to `SHIPPED_LOG.md` in `PROJECT_CONTEXT.md` §10 (Key project
   documents) so the file is discoverable.

## 6. Verification

Use the session scratchpad for temp files, not `/tmp` (win32 environment).

**(1) Information-loss gate — content, not headings.** The prose lives in 2-space
indented continuation lines, so counting `^- ` bullets proves nothing: it returns 68/68
whether bodies survived verbatim or were truncated to their first line. Because §4.1
also reorders to newest-first, compare **sorted non-blank lines**:

```bash
SP="$SCRATCH"          # session scratchpad, not /tmp (win32)
BASE=origin/main       # pin the pre-change side; do NOT use HEAD (see below)

git show $BASE:docs/PROJECT_CONTEXT.md \
  | awk '/^## 5\./{f=1;next} /^\*\*Workflow discipline\*\*/{f=0} /^## 6\./{f=0} f' \
  | tr -d '\r' | sed '/^$/d' | sort > "$SP/before.txt"

tr -d '\r' < docs/SHIPPED_LOG.md \
  | sed '1,/^---END-HEADER---$/d' | sed '/^$/d' | sort > "$SP/after.txt"

diff "$SP/before.txt" "$SP/after.txt"        # MUST be empty
```

Three mechanics that are easy to get wrong, all verified against the file:

- **Terminate the awk range at `**Workflow discipline**`; do not filter one line.**
  That block is **three** lines (1357-1359) and its 2nd and 3rd lines start at column 0
  (`-> ...`, `boundaries ...`), so a `grep -v` on the first line leaves two orphans in
  `before.txt` and the gate **false-fails on a perfectly correct migration**. The real
  danger is an implementer then "fixing" the gate by loosening it. Verified exact:
  within §5's body the only column-0 non-blank, non-`- ` lines are the `## 5.` heading
  (consumed by `next`) and those three.
- **`tr -d '\r'` on both sides — and on the after-side it must run BEFORE the
  sentinel `sed`, not after.** `/^---END-HEADER---$/` is the only end-anchored pattern
  in the gate. `PROJECT_CONTEXT.md` is stored **and** checked out CRLF, and the body is
  moved *out of* it, so `SHIPPED_LOG.md` is **likely** to be CRLF too — in which case
  the real line is `---END-HEADER---\r`, the anchored pattern does not match, and an
  unmatched `addr2` in `1,/re/d` extends the range to **EOF**. `after.txt` comes out
  empty and the gate reports what looks like total data loss. Hence `tr -d '\r' <
  file | sed …`, never `sed … | tr -d '\r'`.

  **General rule: normalize line endings before any end-anchored pattern, never
  after.** The awk on the before-side is safe because none of its three patterns is
  end-anchored; that is luck, not design, so do not reorder it either.
- **Pin `BASE` to `origin/main` or an explicit pre-change SHA.** `HEAD:` is correct only
  while the change is uncommitted; pinning makes the check order-independent.

**(2) Citation integrity.** Every artifact path referenced before must still be
referenced after:

```bash
git show $BASE:docs/PROJECT_CONTEXT.md | grep -oE 'docs/(wiki|superpowers)/[a-z0-9/-]+\.md' \
  | sort -u > "$SP/cite_before.txt"
cat docs/PROJECT_CONTEXT.md docs/SHIPPED_LOG.md \
  | grep -oE 'docs/(wiki|superpowers)/[a-z0-9/-]+\.md' | sort -u > "$SP/cite_after.txt"
diff "$SP/cite_before.txt" "$SP/cite_after.txt"   # MUST be empty
```
This proves the *set* survived; it cannot prove a link stayed on the right bullet —
that is covered by (1)'s verbatim diff.

**(3) Pending-action coverage.** Run both patterns — stated literally so the count is
reproducible (§1's 13/21 came from exactly these):

```bash
NARROW='founder go-live|go-live pending|founder-run|founder run pending|founder-gated'
BROAD="$NARROW"'|deploys on merge|founder verifies|founder follow-up|remaining =|pending'
```

Every **narrow** hit (13) must land in "Built — awaiting go-live" or be explicitly
justified in the PR body. Every **broad**-only hit (8 more) must be consciously triaged,
not silently dropped. This is a review checkpoint requiring per-bullet judgment — the
regex identifies candidates, it does not classify them.

**(4) Tax measurement.** Re-run `wc -c` across `CLAUDE.md` + imports; record
before/after in the PR body. Target ≈19,000 tokens; treat as a measurement, not a gate.

**(5) Internal Donny retrieval.** After merge and `npm run sync:internal`, query
Internal Donny for a **mid-file** shipped item (not the first entry) to confirm it is
reachable — and expect the §4.2 embedding-truncation caveat to show. Confirm the
`internal_docs` row for `SHIPPED_LOG.md` exists with `is_core = true`.

**(6) Build.** `npm run build` — expected no-op (docs only), but the repo rule is build
before push.

**Not a verification path:** `verify-knowledge` does **not** cover this change. Its
three gating checks are wiki lint, RAG freshness vs `docs/wiki/{concepts,entities,
analyses}`, and index/log currency; SKILL.md lines 57–60 state explicitly that the
"do the core docs reflect the work" judgment is **not gated** and must not enter
`missing[]`. It will return `done:true` regardless of what happens to §5. *(Rev 1
claimed the opposite — that was false assurance.)* Run it if convenient as an unrelated
regression check, but it proves nothing here.

**Reviews.** Whole-branch review, then the mandatory Codex second pass
(`codex review --base main`). No `edge-function-reviewer` needed — no edge functions.

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Pending founder actions lost** | §4.1 three-way split + `**Pending:**` clause; Decision 4 fails toward visibility; §6 check (3) |
| Concurrent worktree edits §5 → merge conflict, and shifts line numbers | Heading-anchor extraction (§5.1), not line numbers. Land on a clean branch, fast; 30+ worktrees exist and `knowledge-sync` writes here often |
| A future session re-bloats §5 | §4.3 **(a) and (b)** — both generators, in-scope |
| Internal Donny recall | Row is auto-created (§4.2), but content past 24,000 chars is **not embedded**. Not a regression (same truncation applies today), and the split *improves* `PROJECT_CONTEXT.md`'s own coverage. Verify with a mid-file query (§6.5) |
| `strategy-library-audit-agent` re-flags the log monthly | §4.4 header declares intent |
| Summarizing loses nuance | Avoided by design — verbatim move, never rewritten |
| Some "pending" notes are stale (work since done) | Out of scope to reconcile. **Deliverable:** the PR body carries an explicit checklist enumerating every "Awaiting go-live" entry with its pending step, for founder yes/no. Prose alone would leave the section permanently stale |
| `PROJECT_CONTEXT.md` is "single source of truth" | It remains so for identity, targets, principles, operating instructions, and in-flight work. Only the changelog relocates |

## 8. Expected Outcome

| | Before | After |
|---|---:|---:|
| `PROJECT_CONTEXT.md` §5 | ~29,950 tok | ~3,500–4,500 tok |
| Total always-loaded | **~45,700 tok** | **~19,000–20,000 tok** |
| Growth per shipped branch | +~440 tok, forever | ~+15 tok (one index line) |

Targets are measurements, not gates. Revised again in rev 3 to account for the
`**Pending:**` clauses rev 2 introduced: ~13–21 Awaiting-go-live entries at ~4 lines
each (~52–84 lines), ~47 shipped at ~2 lines (~94), plus in-flight entries and section
headers (~15) → **~160–195 lines / ~3,500–4,500 tokens**, landing the total near
**~19,000–20,000**. The ~−57% headline holds. Do not read the line figure as a gate.

**Future work (not this branch):** the Shipped index still grows ~15 tok/branch
unbounded. A rollup rule — entries older than 12 months collapse to one line per
quarter — would prevent slow recurrence. Deliberately *not* in scope here: it has no
effect for a year, and writing it now means shipping a rule with no way to test it.

## 9. Deferred (separate branches)

1. **Script-driven skills** — all 13 `.claude/skills/` contain zero executable scripts,
   yet several are fully deterministic (`refresh-main`, `worktree-cleanup`, parts of
   `codex-review` and `verify-knowledge`). Scripts cost zero tokens and cannot
   hallucinate. Aligns with the project's own "Automate last" principle.
2. **Minimum-viable-model subagents** — only one subagent exists
   (`edge-function-reviewer`). The prior `claude-subagents-audit` already flagged this;
   routing grunt work to Haiku-tier subagents cuts compute per token rather than token
   count.

## 10. Provenance

Prompted by "Paste This Into Claude, Never Hit a Token Limit Again" (Austin Marchese,
YouTube). Adopted: audit `/context`, treat `CLAUDE.md` as a directory rather than a
document, keep it near ~200 lines. Rejected: RTK and pxpipe (third-party, in a
credential-bearing repo), the Caveman plugin (degrades founder-facing reporting),
engine-swap to GLM/DeepSeek (conflicts with the Opus 4.8 campaign-generation
requirement), and local models (the source itself advises against it today).

**Rev 2** incorporates a spec review that found six issues in rev 1: an
information-loss gate that counted headings rather than content; a hardcoded line range
that moved both the `## 5.` heading and the operating-instruction
`**Workflow discipline**` block; a false claim that `verify-knowledge` covered this
change; an undefined in-flight/shipped classification that would have dropped pending
founder actions (measured at the time as **21 bullets** — *superseded, see rev 3*); an
underdetermined entry format; and a `CLAUDE.md` non-goal that contradicted the
generator fix it depended on.

**Rev 3** incorporates a second review of rev 2, all findings mechanical rather than
structural: the `**Workflow discipline**` exclusion was one line short of the
three-line block, so the primary gate would have **false-failed on a correct
migration**; the `---END-HEADER---` sentinel was used in §6 but never specified in
§4.4, where the header is defined; the classification table had no row for explicitly
deferred future phases (**19 bullets**), which Decision 4 would have wrongly swept into
the actionable "Awaiting go-live" list; and the founder/deploy regex was unstated, so
its count — promoted in rev 2 to a design driver — was not reproducible. Stating it
also corrected rev 2's headline number: **13** bullets carry explicit go-live language;
the "21" figure came from a broad pattern that includes false positives such as
"deploys on merge", which this spec itself classifies as Shipped. `tr -d '\r'`
normalization, a pinned diff base, a PR-body triage checklist, and honest
~200–210-line / ~19,500–20,000-token targets were adopted from the same review.

**Rev 4** applies the third review's single blocking finding — and it inverted rev 3's own
stated rationale. On the after-side, `tr -d ''` ran *after* `sed '1,/^---END-HEADER---$/d'`,
the one end-anchored pattern in the gate. Since the body is moved *out of* a CRLF file,
`SHIPPED_LOG.md` is **likely** CRLF, the real line is `---END-HEADER---`, the anchor fails
to match, and an unmatched `addr2` extends the range to EOF — emptying `after.txt` and
reporting what looks like total data loss. Rev 3 had argued the opposite risk ("may land
LF"); the fix direction happened to be right, the reasoning was not. Normalization now
precedes the split, with a general rule recorded: **normalize line endings before any
end-anchored pattern, never after.** Also applied: `$BASE` pinning in check (2), row-2-beats-row-4
precedence, corrected §8 arithmetic, and aligned token figures.
