# Session Context-Tax Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the always-loaded per-session context from ~45,700 to ~19,000–20,000 tokens by splitting `docs/PROJECT_CONTEXT.md` §5 into a compact index plus a new, non-imported `docs/SHIPPED_LOG.md`, and amending both instructions that cause it to regrow.

**Architecture:** §5 ("Active Workstreams") is a changelog wearing a workstream label — 68 prose bullets, ~29,950 tokens, 65% of the session tax. The full prose moves **verbatim** to `docs/SHIPPED_LOG.md`, which `CLAUDE.md` does not import but `sync-internal-docs.mjs` picks up automatically (non-recursive `docs/*.md` glob), so Internal Donny retains it. §5 becomes a multi-way index. Both generators (`knowledge-sync` step 4 and `CLAUDE.md` line 162) are amended so future sessions write detail to the log, not the loaded file.

**Tech Stack:** Markdown docs only. One throwaway Node ESM helper (`scripts/ctx-split-worksheet.mjs`, `node:fs` only, zero deps). Bash for verification. **No application code, schema, RLS, edge function, or secret changes.**

**Spec:** `docs/superpowers/specs/2026-07-18-context-tax-reduction-design.md` (rev 4, three review rounds passed)

## Global Constraints

- **Docs-only.** No change to `src/`, `supabase/`, schema, RLS, edge functions, or secrets.
- **Move, never summarize.** §5 prose relocates byte-for-byte. Zero-information-loss is proven by the Task 2 gate, not by judgment.
- **`CLAUDE.md` is edited in exactly one place** — the line-162 clause (Task 4). No other `CLAUDE.md` change.
- **Do not touch** `DATABASE_SCHEMA.md`, `DESIGN_SYSTEM.md`, `KNOWLEDGE_WIKI.md` content.
- **Do not modify** the `**Workflow discipline**` paragraph at the end of §5 — it is an operating instruction and must stay in `PROJECT_CONTEXT.md`.
- **Normalize line endings BEFORE any end-anchored pattern, never after.** `PROJECT_CONTEXT.md` is CRLF; `---END-HEADER---\r` will not match `/^---END-HEADER---$/`, and an unmatched `addr2` in `sed '1,/re/d'` deletes to EOF — producing an empty file that looks like total data loss.
- **Scratchpad, not `/tmp`** (win32). Use `SP="C:/Users/dwill/AppData/Local/Temp/claude/C--GIT-dragoncandy-v3-d783432b/4edb2de1-bf27-4f26-b46f-e595806b1f82/scratchpad"`.
- **Land fast.** 30+ worktrees write to `PROJECT_CONTEXT.md`; a long-lived branch will conflict badly.
- Do not run `git stash` bare — this worktree shares the stash stack.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `scripts/ctx-split-worksheet.mjs` | Create (Task 1) | One-shot migration aid: emits the classification worksheet and the reversed log body. Deleted in Task 5. |
| `docs/SHIPPED_LOG.md` | Create (Task 2) | Append-only, newest-first changelog. Header + `---END-HEADER---` sentinel + the 68 bullets verbatim. Not imported by `CLAUDE.md`. |
| `docs/PROJECT_CONTEXT.md` | Modify §5 (Task 3), §10 (Task 4) | §5 becomes a three-section index; §10 gains a pointer to the log. |
| `.claude/skills/knowledge-sync/SKILL.md` | Modify line 49 (Task 4) | Generator (a): routes session detail to the log. |
| `CLAUDE.md` | Modify line 162 (Task 4) | Generator (b): the load-bearing one — always-loaded, so it must agree with (a). |

---

### Task 1: Branch, migration tooling, and baseline measurement

**Files:**
- Create: `scripts/ctx-split-worksheet.mjs`
- Create (scratch, not committed): `$SP/worksheet.md`, `$SP/baseline.txt`

**Interfaces:**
- Consumes: nothing.
- Produces: `node scripts/ctx-split-worksheet.mjs --md` → markdown worksheet on stdout, counts JSON on stderr. `node scripts/ctx-split-worksheet.mjs --emit-log-body` → §5's bullets reversed newest-first on stdout. Task 2 consumes `--emit-log-body`; Task 3 consumes the worksheet.

- [ ] **Step 1: Create the branch**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/dc-improvements-2"
git fetch origin
git checkout -b chore/context-tax-reduction origin/main
```

Expected: `Switched to a new branch 'chore/context-tax-reduction'`

- [ ] **Step 2: Confirm the spec commit is present**

The spec was committed on `main` as `a6be8c12`. If `git log --oneline -1 -- docs/superpowers/specs/2026-07-18-context-tax-reduction-design.md` returns nothing, cherry-pick it: `git cherry-pick a6be8c12`.

- [ ] **Step 3: Create the migration helper**

Create `scripts/ctx-split-worksheet.mjs` with exactly this content:

```javascript
#!/usr/bin/env node
// ctx-split-worksheet.mjs — one-shot migration aid for the PROJECT_CONTEXT §5 split.
//
// Reads docs/PROJECT_CONTEXT.md, isolates §5's body (heading-anchored, excluding the
// trailing **Workflow discipline** operating-instruction block), and emits either a
// classification worksheet (--md) or the reversed log body (--emit-log-body).
//
// It does NOT classify — classification is per-bullet judgment (spec §4.1). It removes
// the mechanical part: finding each bullet's name, pointer, refs, and signal hits.
//
// Spec: docs/superpowers/specs/2026-07-18-context-tax-reduction-design.md
// Delete this script once the migration lands (Task 5).

import { readFileSync } from "node:fs";

const SRC = "docs/PROJECT_CONTEXT.md";

// Signal patterns — copied verbatim from spec §6.3 so counts stay reproducible.
const NARROW =
  /founder go-live|go-live pending|founder-run|founder run pending|founder-gated/i;
const BROAD_EXTRA =
  /deploys on merge|founder verifies|founder follow-up|remaining =|\bpending\b/i;
const DEFER = /deferred|designed but deferred|gated on/i;

function section5Body(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^## 5\./.test(l));
  if (start === -1) throw new Error("§5 heading not found");
  const rest = lines.slice(start + 1);
  // Terminate at the Workflow-discipline block OR §6, whichever comes first.
  let end = rest.findIndex(
    (l) => /^\*\*Workflow discipline\*\*/.test(l) || /^## 6\./.test(l),
  );
  if (end === -1) end = rest.length;
  return rest.slice(0, end);
}

function splitBullets(lines) {
  const out = [];
  let cur = null;
  for (const l of lines) {
    if (l.startsWith("- ")) {
      if (cur) out.push(cur);
      cur = [l];
    } else if (cur) {
      cur.push(l);
    }
  }
  if (cur) out.push(cur);
  return out;
}

function nameOf(bullet) {
  // Join the first two lines — many entries wrap mid-title — then cut at the status
  // marker ("— **shipped", "— **built", "(PR #…"), NOT at the first em-dash.
  // Cutting at the first em-dash collapses every AIOS entry to "DragonCandy AIOS".
  const head = (bullet[0] + " " + (bullet[1] || ""))
    .replace(/^- /, "")
    .replace(/\s+/g, " ")
    .trim();
  const cut = head.search(
    /\s*[—–-]\s*\*\*(shipped|built|live|triaged|prepped|deployed)|\s*\(PR #|\s*—\s*\*\*(?:shipped|built)/i,
  );
  const name = (cut > 0 ? head.slice(0, cut) : head).replace(/\*\*/g, "").trim();
  return name.replace(/[—–\-,:;]+$/, "").trim().slice(0, 78);
}

const text = readFileSync(SRC, "utf8");
const bullets = splitBullets(section5Body(text));

// --emit-log-body: print §5's bullets reversed (newest-first, per spec §4.1/§4.4) for
// the SHIPPED_LOG.md body. Order does not affect the §6 gate — it compares SORTED
// lines precisely so a reordering migration still proves byte-level preservation.
if (process.argv.includes("--emit-log-body")) {
  const out = [];
  for (const b of [...bullets].reverse()) {
    const trimmed = [...b];
    while (trimmed.length && trimmed[trimmed.length - 1].trim() === "") trimmed.pop();
    out.push(trimmed.join("\n"), "");
  }
  process.stdout.write(out.join("\n").replace(/\n+$/, "\n"));
  console.error(`emitted ${bullets.length} bullets, newest-first`);
  process.exit(0);
}

const rows = bullets.map((b, i) => {
  const body = b.join("\n");
  const wiki = [
    ...body.matchAll(/docs\/wiki\/(?:concepts|analyses|entities)\/[a-z0-9-]+\.md/g),
  ].map((m) => m[0]);
  const spec = [
    ...body.matchAll(/docs\/(?:superpowers\/specs|runbooks)\/[0-9a-z-]+\.md/g),
  ].map((m) => m[0]);
  // Catch "PR #285", "PRs #146, #148", and bare "#282" in a PR list. Two-to-four
  // digits avoids matching hashtags like #DragonDashed.
  const prs = [...body.matchAll(/#(\d{2,4})\b/g)].map((m) => `#${m[1]}`);
  // \s+ not a literal space — "branch" and its backticked name often straddle a
  // wrapped line, which a single-space match silently misses.
  const branch = (body.match(/branch\s+[`'"]([\w/.-]+)[`'"]/) || [])[1] || "";
  const narrow = NARROW.test(body);
  const broad = narrow || BROAD_EXTRA.test(body);

  // Pointer precedence (spec §4.1): wiki page wins over spec; else SHIPPED_LOG.md.
  const pointer = wiki[0] || spec[0] || "docs/SHIPPED_LOG.md";
  // Refs (spec §4.1): PRs, else branch, else omit entirely.
  const refs = prs.length
    ? [...new Set(prs)].join(", ")
    : branch
      ? `\`${branch}\``
      : "";

  return {
    n: i + 1,
    name: nameOf(b),
    lines: b.length,
    pointer,
    pointerKind: wiki[0] ? "wiki" : spec[0] ? "spec" : "LOG",
    refs,
    narrow,
    broad,
    defer: DEFER.test(body),
  };
});

console.log(
  "| # | Name | Lines | Pointer | Kind | Refs | Narrow | Broad | Defer | Section (FILL IN) |",
);
console.log("|--:|---|--:|---|---|---|:-:|:-:|:-:|---|");
for (const r of rows) {
  console.log(
    `| ${r.n} | ${r.name} | ${r.lines} | \`${r.pointer}\` | ${r.pointerKind} | ${r.refs || "—"} | ${r.narrow ? "Y" : ""} | ${r.broad ? "Y" : ""} | ${r.defer ? "Y" : ""} | |`,
  );
}

console.error(
  "\n" +
    JSON.stringify(
      {
        bullets: rows.length,
        narrow: rows.filter((r) => r.narrow).length,
        broadOnly: rows.filter((r) => r.broad && !r.narrow).length,
        defer: rows.filter((r) => r.defer).length,
        pointerWiki: rows.filter((r) => r.pointerKind === "wiki").length,
        pointerSpec: rows.filter((r) => r.pointerKind === "spec").length,
        pointerLog: rows.filter((r) => r.pointerKind === "LOG").length,
        noRefs: rows.filter((r) => !r.refs).length,
      },
      null,
      2,
    ),
);
```

- [ ] **Step 4: Run it and verify it reproduces the spec's numbers**

```bash
SP="C:/Users/dwill/AppData/Local/Temp/claude/C--GIT-dragoncandy-v3-d783432b/4edb2de1-bf27-4f26-b46f-e595806b1f82/scratchpad"
node scripts/ctx-split-worksheet.mjs --md > "$SP/worksheet.md"
```

Expected on stderr — these must match the spec exactly. **If any number differs, stop:** `PROJECT_CONTEXT.md` has changed since the spec was written and the classification counts in spec §1 need re-deriving before continuing.

```json
{
  "bullets": 68,
  "narrow": 13,
  "broadOnly": 8,
  "defer": 19,
  "pointerWiki": 45,
  "pointerSpec": 13,
  "pointerLog": 10,
  "noRefs": 14
}
```

(`narrow` 13 + `broadOnly` 8 = the 21 broad candidates cited in spec §1.)

- [ ] **Step 5: Record the baseline measurement**

```bash
wc -c CLAUDE.md docs/PROJECT_CONTEXT.md docs/DESIGN_SYSTEM.md \
      docs/DATABASE_SCHEMA.md docs/KNOWLEDGE_WIKI.md | tee "$SP/baseline.txt"
```

Expected total ≈ **175,295 bytes** (~43,800 tokens). Keep this file — Task 5 diffs against it.

- [ ] **Step 6: Commit the helper**

```bash
git add scripts/ctx-split-worksheet.mjs
git commit -m "chore(ctx): add one-shot §5 split migration helper

Emits the classification worksheet and the reversed log body for the
PROJECT_CONTEXT §5 split. Deleted once the migration lands.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Create `docs/SHIPPED_LOG.md` — verbatim move + the zero-loss gate

**Files:**
- Create: `docs/SHIPPED_LOG.md`

**Interfaces:**
- Consumes: `node scripts/ctx-split-worksheet.mjs --emit-log-body` from Task 1.
- Produces: `docs/SHIPPED_LOG.md` containing a header, the literal sentinel `---END-HEADER---`, and all 68 bullets newest-first. Task 3's index entries point at this file for the 10 unlinked bullets.

**This is the task the whole plan's safety rests on.** `PROJECT_CONTEXT.md` is NOT modified here — §5 still exists after this task. That is deliberate: the content is duplicated for one commit rather than ever absent.

- [ ] **Step 1: Write the header with the required sentinel**

Create `docs/SHIPPED_LOG.md` with exactly this content (the body is appended in Step 2):

```markdown
# DragonCandy — Shipped Log

> Append-only changelog of completed work, **newest first**. Split out of
> `docs/PROJECT_CONTEXT.md` §5 on 2026-07-18, where it had grown to ~29,950 tokens —
> 65% of the context loaded into every Claude Code session.
>
> **This file is deliberately NOT imported by `CLAUDE.md`.** It is not auto-loaded.
> Read it on demand when you need the history behind a shipped feature.
>
> It *is* collected by `supabase/scripts/sync-internal-docs.mjs` (non-recursive
> `docs/*.md` glob), so it reaches `/internal/strategy` and Internal Donny's RAG.
> Note `MAX_EMBED_CHARS = 24_000`: content past that is stored and readable but not
> embedded, so semantic retrieval covers only the newest entries.
>
> **Prose duplication with `docs/wiki/` is intentional and not a defect.** The wiki
> holds the durable synthesis; this file holds the as-shipped session record. The
> monthly `strategy-library-audit-agent` should not file `strategy-dupe` or
> `strategy-bloat` findings against it.
>
> **Adding an entry:** prepend it (newest first). See `knowledge-sync` step 4.
> `PROJECT_CONTEXT.md` §5 is an index — one line per entry, detail lives here.

---END-HEADER---
```

- [ ] **Step 2: Append the §5 body, reversed to newest-first**

```bash
node scripts/ctx-split-worksheet.mjs --emit-log-body >> docs/SHIPPED_LOG.md
```

Expected on stderr: `emitted 68 bullets, newest-first`

- [ ] **Step 3: Verify the sentinel appears exactly once**

```bash
grep -c '^---END-HEADER---' docs/SHIPPED_LOG.md
```

Expected: `1`

If this is `0`, the header was mistyped — the gate in Step 4 would then delete through EOF and report total data loss. Fix before proceeding.

- [ ] **Step 4: RUN THE ZERO-LOSS GATE (this is the gate, not a suggestion)**

```bash
SP="C:/Users/dwill/AppData/Local/Temp/claude/C--GIT-dragoncandy-v3-d783432b/4edb2de1-bf27-4f26-b46f-e595806b1f82/scratchpad"
BASE=origin/main

git show $BASE:docs/PROJECT_CONTEXT.md \
  | awk '/^## 5\./{f=1;next} /^\*\*Workflow discipline\*\*/{f=0} /^## 6\./{f=0} f' \
  | tr -d '\r' | sed '/^$/d' | sort > "$SP/before.txt"

tr -d '\r' < docs/SHIPPED_LOG.md \
  | sed '1,/^---END-HEADER---$/d' | sed '/^$/d' | sort > "$SP/after.txt"

diff "$SP/before.txt" "$SP/after.txt" && echo "GATE PASS — zero information loss"
wc -l "$SP/before.txt" "$SP/after.txt"
```

Expected: `GATE PASS — zero information loss`, and both files **1264** lines.

**This exact pipeline was tested end-to-end during planning and passed at 1,264/1,264.** If it fails now:
- **`after.txt` empty (0 lines)** → the sentinel didn't match. Almost always CRLF: `tr -d '\r'` must run *before* the `sed`, never after. Re-check Step 3.
- **Orphan lines only in `before.txt` starting `→` or `boundaries`** → the awk range didn't terminate at `**Workflow discipline**`. That block is three lines, all at column 0. Do NOT "fix" this by loosening the gate — that discards the entire safety guarantee.
- **Any other diff** → real content loss. Stop and investigate.

- [ ] **Step 5: Commit**

```bash
git add docs/SHIPPED_LOG.md
git commit -m "docs(ctx): add SHIPPED_LOG.md with PROJECT_CONTEXT §5 prose, verbatim

Moves all 68 §5 bullets into a newest-first append-only log, NOT imported by
CLAUDE.md. §5 itself is unchanged in this commit — content is duplicated for one
commit rather than ever absent.

Zero-loss gate passed: sorted-line diff empty, 1264/1264 lines.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Rewrite §5 as a three-section index

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md` (§5 body only — heading stays, `**Workflow discipline**` stays)

**Interfaces:**
- Consumes: `$SP/worksheet.md` (Task 1), `docs/SHIPPED_LOG.md` (Task 2).
- Produces: a §5 of ~160–195 lines whose "Built — awaiting founder go-live" subsection Task 5 enumerates into the PR body.

**This is the only task requiring judgment.** The worksheet supplies each bullet's name, pointer, refs, and signal hits; you supply the section.

- [ ] **Step 1: Classify all 68 bullets in the worksheet**

Open `$SP/worksheet.md` and fill the "Section (FILL IN)" column using this binding rule (spec §4.1):

| Condition | Section |
|---|---|
| Work not yet complete | **In flight** |
| Complete, but a founder/deploy step outstanding (migration, edge-fn deploy, secret, `/schedule`, flag flip) | **Awaiting** + a `**Pending:**` clause |
| Complete, no outstanding action | **Shipped** |
| Complete, with an explicitly deferred future phase ("Phase 4 deferred", "gated on X") | **Shipped** — state the deferral in the clause |
| Legacy open-ended bullet, no completion marker, no artifact | **Shipped**, phrased as ongoing practice, unless genuinely being worked now |
| Unclear whether a founder step is outstanding | **Awaiting** + flag for the PR body |

Three binding carve-outs:
- **"Deploys on merge" is NOT a founder action** — normal Vercel behavior → Shipped.
- **Row 2 beats row 4.** A bullet with both an outstanding founder step *and* a deferred phase (DRE v1 is exactly this) → **Awaiting**; mention the deferral in the clause.
- **Deferred is NOT pending.** The 19 `Defer=Y` rows must not land in Awaiting unless they independently hit row 2. Padding that list destroys its purpose.

Expect roughly: 2–4 In flight, 13–21 Awaiting, the rest Shipped. `Narrow=Y` (13 rows) are the high-confidence Awaiting candidates; `Broad=Y` without `Narrow` (8 rows) each need a conscious call, not a silent drop.

- [ ] **Step 2: Replace §5's body**

Keep the `## 5. Active Workstreams` heading and the trailing `**Workflow discipline**` paragraph **exactly as they are**. Replace only the bullets between them with:

```markdown
> Index only — one line per entry. Full prose for shipped work lives in
> `docs/SHIPPED_LOG.md`; durable synthesis lives in `docs/wiki/`. Keep this section
> short: it loads into every session.

### In flight

- **Content delivery system stabilization** — bug-fixing the creator→business content
  handoff and payment flow; gates production launch.

### Built — awaiting founder go-live

- **Dragon Rewards Engine (DRE) v1** — points ledger, idempotent award engine, 5 tiers
  + badges; backend live. Later phases (referrals, streaks, redemption) deferred.
  **Pending:** apply both migrations, set Vault `dre_award_engine_url`, deploy
  `dre-award-engine`, set the real `go_live_at`, confirm the cron.
  → `docs/wiki/concepts/dragon-rewards-engine.md` · #196

### Shipped

- **Light-theme polish** — shared light-app kit (`PageBody`/`AppCard`/`AppChip`/
  `AppStatusBadge`); phases 1–3 rolled out. Phase 4 (Outstand surface) deferred.
  → `docs/wiki/concepts/light-app-kit.md` · #280, #282, #285
- **DragonFeed** — creator-content discovery; mobile vertical feed + Instagram-style
  creator search. → `docs/wiki/concepts/dragon-feed.md` · #242, #247
```

Entry format is binding (spec §4.1):

```
- **<Name>** — <one clause: what it is + status>. → <pointer> · <refs>
```

- **Pointer:** wiki page if one exists; else the spec; else `docs/SHIPPED_LOG.md` **with no fragment anchor** (the log has no headings, so no anchor targets exist). When a bullet cites both, use the **wiki page only**.
- **Refs:** `#N` comma-separated; if no PR, the branch in backticks; if neither, **omit the ` · <refs>` segment entirely** — never write "n/a".
- **`**Pending:**` clause:** Awaiting section only. Condense the source bullet's outstanding steps to one sentence.
- Take each entry's name, pointer, and refs from the worksheet columns — they are already resolved per the precedence rules.

- [ ] **Step 3: Verify the heading and Workflow-discipline block survived**

```bash
grep -c '^## 5\. Active Workstreams' docs/PROJECT_CONTEXT.md   # expect 1
grep -c '^\*\*Workflow discipline\*\*' docs/PROJECT_CONTEXT.md  # expect 1
grep -A2 '^\*\*Workflow discipline\*\*' docs/PROJECT_CONTEXT.md # expect all 3 lines intact
```

- [ ] **Step 4: Run citation-integrity check (spec §6.2)**

```bash
SP="C:/Users/dwill/AppData/Local/Temp/claude/C--GIT-dragoncandy-v3-d783432b/4edb2de1-bf27-4f26-b46f-e595806b1f82/scratchpad"
BASE=origin/main

git show $BASE:docs/PROJECT_CONTEXT.md \
  | grep -oE 'docs/(wiki|superpowers)/[a-z0-9/-]+\.md' | sort -u > "$SP/cite_before.txt"
cat docs/PROJECT_CONTEXT.md docs/SHIPPED_LOG.md \
  | grep -oE 'docs/(wiki|superpowers)/[a-z0-9/-]+\.md' | sort -u > "$SP/cite_after.txt"

diff "$SP/cite_before.txt" "$SP/cite_after.txt" && echo "CITATIONS INTACT"
```

Expected: `CITATIONS INTACT`. Every artifact referenced before is still referenced across the two files.

- [ ] **Step 5: Run pending-action coverage check (spec §6.3)**

```bash
grep -n 'Pending:' docs/PROJECT_CONTEXT.md | wc -l
```

Cross-check against your worksheet: every `Narrow=Y` row (13) must appear in the Awaiting section or be explicitly justified — you will list those justifications in the Task 5 PR body. Every `Broad=Y`-without-`Narrow` row (8) must have been consciously triaged.

- [ ] **Step 6: Re-run the Task 2 gate — it must STILL pass**

```bash
SP="C:/Users/dwill/AppData/Local/Temp/claude/C--GIT-dragoncandy-v3-d783432b/4edb2de1-bf27-4f26-b46f-e595806b1f82/scratchpad"
BASE=origin/main
git show $BASE:docs/PROJECT_CONTEXT.md \
  | awk '/^## 5\./{f=1;next} /^\*\*Workflow discipline\*\*/{f=0} /^## 6\./{f=0} f' \
  | tr -d '\r' | sed '/^$/d' | sort > "$SP/before.txt"
tr -d '\r' < docs/SHIPPED_LOG.md \
  | sed '1,/^---END-HEADER---$/d' | sed '/^$/d' | sort > "$SP/after.txt"
diff "$SP/before.txt" "$SP/after.txt" && echo "GATE STILL PASS"
```

Expected: `GATE STILL PASS`. It compares `origin/main` against the log, so editing §5 cannot affect it — a failure here means `SHIPPED_LOG.md` was touched by mistake.

- [ ] **Step 7: Commit**

```bash
git add docs/PROJECT_CONTEXT.md
git commit -m "docs(ctx): rewrite PROJECT_CONTEXT §5 as an index

68 prose bullets (~29,950 tok) become a three-section index: In flight,
Built — awaiting founder go-live (with Pending: clauses), and Shipped
one-liners pointing at docs/wiki or SHIPPED_LOG.md.

Heading and the **Workflow discipline** operating instruction preserved.
Citation-integrity check passed; zero-loss gate still passes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Amend both generators + add the §10 pointer

**Files:**
- Modify: `.claude/skills/knowledge-sync/SKILL.md:49`
- Modify: `CLAUDE.md:162`
- Modify: `docs/PROJECT_CONTEXT.md` §10 (line ~1492, "Key project documents")

**Interfaces:**
- Consumes: `docs/SHIPPED_LOG.md` existing (Task 2).
- Produces: nothing downstream. This is the change that makes the fix permanent.

**Without this task the file regrows to its current size within months.** Task 3 alone is a one-time trim.

- [ ] **Step 1: Amend `knowledge-sync` step 4**

In `.claude/skills/knowledge-sync/SKILL.md`, find:

```markdown
4. **Refresh core docs as warranted** (only what the work actually changed):
   - `docs/PROJECT_CONTEXT.md` — Active Workstreams / Current State (almost always).
   - `docs/DATABASE_SCHEMA.md` — if tables/columns/views changed.
```

Replace the `PROJECT_CONTEXT.md` line with:

```markdown
   - `docs/SHIPPED_LOG.md` — **prepend** the session's full entry, newest-first
     (almost always).
   - `docs/PROJECT_CONTEXT.md` §5 — **only** when work *starts* (add to In flight),
     *reaches built-but-not-live* (move to Awaiting go-live with a `**Pending:**`
     clause), or *fully completes* (move to Shipped as a one-liner + pointer). One line
     per entry — plus a `**Pending:**` clause for Awaiting go-live entries only. Detail
     belongs in `SHIPPED_LOG.md` or the wiki. **§5 is an index, not a log.**
   - `docs/PROJECT_CONTEXT.md` §4 Current State — if the project-level picture changed.
```

- [ ] **Step 2: Amend `CLAUDE.md` line 162 (the load-bearing one)**

In `CLAUDE.md`, find this text inside the "**Knowledge update on branch finish (required).**" paragraph:

```
refresh the affected core docs (`PROJECT_CONTEXT.md`, plus `DATABASE_SCHEMA.md` / `DESIGN_SYSTEM.md` / this file only if schema / design / a workflow rule changed)
```

Replace with:

```
prepend the session's full entry to `docs/SHIPPED_LOG.md` (**not** `PROJECT_CONTEXT.md` §5 — that section is a one-line-per-entry index, and detail there is loaded into every future session), refresh the affected core docs (`PROJECT_CONTEXT.md` §5 index line + §4 Current State, plus `DATABASE_SCHEMA.md` / `DESIGN_SYSTEM.md` / this file only if schema / design / a workflow rule changed)
```

Change nothing else in `CLAUDE.md` (Global Constraints).

- [ ] **Step 3: Add the §10 pointer**

In `docs/PROJECT_CONTEXT.md`, find:

```markdown
**Key project documents**:
- `CLAUDE.md` — developer guidance + design system import
```

Insert immediately after the `CLAUDE.md` line:

```markdown
- `docs/SHIPPED_LOG.md` — full prose changelog of shipped work (not auto-loaded; §5 indexes it)
```

- [ ] **Step 4: Verify all three edits landed**

```bash
grep -c 'SHIPPED_LOG' CLAUDE.md                                  # expect 1
grep -c 'SHIPPED_LOG' .claude/skills/knowledge-sync/SKILL.md      # expect 1
grep -c 'SHIPPED_LOG' docs/PROJECT_CONTEXT.md                     # expect >= 2 (§5 preamble + §10)
grep -c 'Active Workstreams / Current State (almost always)' \
  .claude/skills/knowledge-sync/SKILL.md                          # expect 0 (old text gone)
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md .claude/skills/knowledge-sync/SKILL.md docs/PROJECT_CONTEXT.md
git commit -m "docs(ctx): route session detail to SHIPPED_LOG.md in both generators

knowledge-sync step 4 and CLAUDE.md line 162 both instructed appending detail to
PROJECT_CONTEXT.md §5, which is why it compounded ~440 tok per shipped branch.
Both now route detail to SHIPPED_LOG.md and cap §5 at one line per entry.

CLAUDE.md is the load-bearing half: it is itself always-loaded, so a session that
never opens the skill file would otherwise re-bloat §5.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Final verification, cleanup, and PR

**Files:**
- Delete: `scripts/ctx-split-worksheet.mjs`

**Interfaces:**
- Consumes: `$SP/baseline.txt` (Task 1), the Awaiting-go-live section (Task 3).
- Produces: the PR, including the founder triage checklist.

- [ ] **Step 1: Measure the result**

```bash
SP="C:/Users/dwill/AppData/Local/Temp/claude/C--GIT-dragoncandy-v3-d783432b/4edb2de1-bf27-4f26-b46f-e595806b1f82/scratchpad"
echo "=== BEFORE ==="; cat "$SP/baseline.txt"
echo "=== AFTER ==="
wc -c CLAUDE.md docs/PROJECT_CONTEXT.md docs/DESIGN_SYSTEM.md \
      docs/DATABASE_SCHEMA.md docs/KNOWLEDGE_WIKI.md
```

Expected: total drops from ~175,295 to roughly **70,000–75,000 bytes** (~17,500–18,800 tokens for the imports; ~19,000–20,000 including skill frontmatter and the SessionStart hook). Record both in the PR body. This is a measurement, not a gate — do not tune §5 to hit a number.

- [ ] **Step 2: Run the build**

```bash
npm run build
```

Expected: succeeds. Docs-only, so this should be unaffected — but the repo rule is build before push.

- [ ] **Step 3: Delete the migration helper**

```bash
git rm scripts/ctx-split-worksheet.mjs
```

It is one-shot tooling; leaving it implies it is maintained.

- [ ] **Step 4: Run the whole-branch review**

Use `superpowers:requesting-code-review`. Confirm specifically: the `**Workflow discipline**` block is intact, no `src/`/`supabase/` file is in the diff, and `CLAUDE.md` shows exactly one changed hunk.

```bash
git diff origin/main --stat
```

Expected: exactly 4 files — `CLAUDE.md`, `docs/PROJECT_CONTEXT.md`, `docs/SHIPPED_LOG.md`, `.claude/skills/knowledge-sync/SKILL.md` (plus the spec/plan if not already on main).

- [ ] **Step 5: Run the mandatory Codex second review**

```bash
codex review --base main --title "PROJECT_CONTEXT §5 context-tax split"
```

Fix anything real and re-run until clean. Relay the verdict to the user. (No `edge-function-reviewer` — no edge functions in this diff.)

- [ ] **Step 6: Commit cleanup and push**

```bash
git commit -m "chore(ctx): remove one-shot migration helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin chore/context-tax-reduction
```

If `git push` hangs (a known environment issue — send-pack stalls), fall back to the `gh api` blob→tree→commit→ref path recorded in project memory. `git fetch` works normally.

- [ ] **Step 7: Open the PR with the founder triage checklist**

The PR body **must** include a checklist enumerating every "Built — awaiting founder go-live" entry with its pending step (spec §7 — this is a deliverable, not prose). Some of these notes are likely stale; the checklist is how they get reconciled without this plan guessing.

```markdown
## Founder triage — is this still pending?

Some §5 "pending" notes may be stale (work since completed). Please confirm:

- [ ] **Dragon Rewards Engine v1** — apply migrations, set Vault `dre_award_engine_url`,
      deploy `dre-award-engine`, set real `go_live_at`, confirm cron. Still outstanding?
- [ ] _(one line per Awaiting entry, copied from §5)_

Anything you mark done moves to **Shipped** in a follow-up commit.
```

Also state in the PR body: before/after byte counts, that the zero-loss gate passed at 1264/1264, and that `verify-knowledge` does **not** cover this change (spec §6) so its verdict proves nothing here.

- [ ] **Step 8: Post-merge — refresh main and verify Internal Donny**

```bash
git -C "C:/GIT/dragoncandy-v3-d783432b" fetch origin
git -C "C:/GIT/dragoncandy-v3-d783432b" merge --ff-only origin/main
```

The committed `post-merge` hook fires `npm run sync:internal` because `docs/` changed. Then confirm the log reached the strategy library:

```sql
select path, is_core, length(full_content) from internal_docs where path = 'docs/SHIPPED_LOG.md';
```

Expected: one row, `is_core = true` (the top-level `docs/*.md` trigger). Then query Internal Donny for a **mid-file** shipped item — not the newest — and expect the `MAX_EMBED_CHARS = 24_000` truncation to show for older entries. That is the documented limitation in spec §4.2, not a regression.

---

## Self-Review

**Spec coverage:** §4.1 index + classification → Task 3. §4.2 sync destination → Task 5 Step 8. §4.3(a) knowledge-sync → Task 4 Step 1. §4.3(b) CLAUDE.md → Task 4 Step 2. §4.4 header + sentinel → Task 2 Step 1. §5 migration mechanics → Tasks 2–3. §6.1 zero-loss gate → Task 2 Step 4 (re-run Task 3 Step 6). §6.2 citations → Task 3 Step 4. §6.3 pending coverage → Task 3 Step 5. §6.4 measurement → Task 5 Step 1. §6.5 Donny retrieval → Task 5 Step 8. §6.6 build → Task 5 Step 2. §7 PR checklist deliverable → Task 5 Step 7. §9 deferrals → correctly absent.

**Placeholders:** none. Every step carries exact commands, exact expected output, and complete file content. The one judgment step (Task 3 Step 1) supplies the binding rule table, all three carve-outs, and a machine-generated worksheet of the mechanical inputs.

**Consistency:** `$SP` and `BASE=origin/main` are identical across Tasks 2, 3, and 5. `--emit-log-body` and `--md` match the script defined in Task 1. The sentinel `---END-HEADER---` is defined in Task 2 Step 1 and consumed in Task 2 Step 4 and Task 3 Step 6. Counts (68/13/8/19/45/13/10/14) are consistent between Task 1 Step 4 and Task 3 Step 1.
