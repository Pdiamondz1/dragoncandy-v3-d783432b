# Port `roast` + `storm-research` Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `roast` (5-persona idea council) and `storm-research` (5-lens STORM briefing) skills available in DragonCandy as dev `/skills` — installed **global-primary** (`~/.claude/skills/`, usable in every project) plus a byte-identical committed repo copy — with their "brains" copied verbatim and only the persistence plumbing rewired to be project-agnostic.

**Architecture:** Copy the two source skill folders from `C:/GIT/hma_project_foundation/.claude/skills/` **verbatim** (one baseline commit), then adapt each `SKILL.md` in a follow-up commit — repoint persistence from HMA's `outputs/vetting/` + `wiki/vetting.md` + `outputs/change-log.md` to a project-relative `<project-root>/docs/vetting/`, and strip HMA-only references (`autopilot`, `wiki/charter.md`, `web-researcher`, `docs/SUBAGENTS.md`). `report-template.html` copies verbatim with no edits. Finally install byte-identical global copies. No app code, no schema, no shared-config change.

**Tech Stack:** Claude Code skills (markdown `SKILL.md` + an HTML template), the `Agent`/`Task` tool (`general-purpose`), `WebSearch`/`WebFetch`. No build, no tests-as-code — verification is a content check + a live smoke.

**Spec:** `docs/superpowers/specs/2026-07-06-port-roast-storm-skills-design.md`

---

## Environment notes (read before starting)

- **Shell cwd is the MAIN checkout**, not this worktree. Write files to the explicit worktree path
  (`C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\DC-2\…`) and run git with the worktree as cwd:
  `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git …` in one Bash command.
- **Branch:** `feat/port-roast-storm-skills` (already created off `origin/main`, in worktree `DC-2`).
- **Source repo (read-only):** `C:/GIT/hma_project_foundation/.claude/skills/{roast,storm-research}/`.
- **Global skills dir:** `C:/Users/dwill/.claude/skills/` (i.e. `~/.claude/skills/`). Confirmed to contain
  neither `roast` nor `storm-research` today.
- These are **markdown skill files** — there is no `npm run build`/vitest step. The "test" is a content
  check (no HMA paths leaked) plus a live smoke run of each skill.
- **Do not rewrite the council/STORM prompts or the HTML template.** Only the itemized edits below change.

---

## Task 1: Verbatim baseline — copy both source skills into the repo

**Files:**
- Create: `.claude/skills/roast/SKILL.md` (copy)
- Create: `.claude/skills/storm-research/SKILL.md` (copy)
- Create: `.claude/skills/storm-research/report-template.html` (copy)

- [ ] **Step 1: Copy the two skill folders verbatim from the source repo**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" \
  && mkdir -p .claude/skills \
  && cp -r "C:/GIT/hma_project_foundation/.claude/skills/roast" .claude/skills/roast \
  && cp -r "C:/GIT/hma_project_foundation/.claude/skills/storm-research" .claude/skills/storm-research \
  && ls -R .claude/skills/roast .claude/skills/storm-research
```
Expected: `roast/SKILL.md`; `storm-research/SKILL.md` + `storm-research/report-template.html`. (If the
source `roast/` or `storm-research/` also contains other files, copy them too — copy the whole folder.)

- [ ] **Step 2: Confirm the copies are byte-identical to source**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" \
  && diff -r "C:/GIT/hma_project_foundation/.claude/skills/roast" .claude/skills/roast \
  && diff -r "C:/GIT/hma_project_foundation/.claude/skills/storm-research" .claude/skills/storm-research \
  && echo "IDENTICAL"
```
Expected: `IDENTICAL` (no diff output).

- [ ] **Step 3: Confirm they track without any `.gitignore` change**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git add --dry-run .claude/skills/roast .claude/skills/storm-research
```
Expected: lists `roast/SKILL.md`, `storm-research/SKILL.md`, **and** `storm-research/report-template.html`
(no "ignored" warning). If `report-template.html` is missing from the list, STOP — investigate the
`.gitignore` before proceeding (the spec verified it should track; do NOT use `git add -f`).

- [ ] **Step 4: Commit the verbatim baseline**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" \
  && git add .claude/skills/roast .claude/skills/storm-research \
  && git commit -m "port: verbatim copy of roast + storm-research from hma_project_foundation"
```
> This baseline commit intentionally still contains HMA paths — Tasks 2 & 3 adapt them, so the diff shows
> exactly what changed from source.

---

## Task 2: Adapt `roast/SKILL.md` (persistence + strip HMA refs)

**Files:**
- Modify: `.claude/skills/roast/SKILL.md`

Make the four content edits below (Steps 1–4), then verify + commit (Step 5). Keep everything else (the
brief intake, the 5 council personas + their prompts, the Judge/verdict block) **unchanged** — including
Step 5's storm-research chain *logic*, except for repointing its one `outputs/vetting/` path (edit 4).

- [ ] **Step 1: Trim the "Web-availability note" (remove the `web-researcher`/`SUBAGENTS` sentences)**

Find the paragraph beginning `**Web-availability note.**` (end of Step 2). Delete its last two sentences
(the ones starting "When web IS available, the Researcher may be dispatched as the `web-researcher` agent…"
through "See `docs/SUBAGENTS.md`."). The paragraph should end at:
`…the council still runs and the Judge still delivers a verdict (Tier 0, no web, no keys).`

- [ ] **Step 2: Replace "## Step 4: Persist the verdict" with the project-relative version**

Replace the entire `## Step 4: Persist the verdict (save to the knowledge base)` section (all of its
numbered items 1–4) with EXACTLY:

````markdown
## Step 4: Persist the verdict (save to the knowledge base)

After you deliver the verdict in chat, ALSO save it so the idea is vetted on the record.

1. Resolve the **project root**: `git rev-parse --show-toplevel` if inside a git repo, else the current
   directory. All paths below are relative to it. Derive a kebab-case `<slug>` from the idea. The run
   folder is `docs/vetting/<YYYY-MM-DD>-<slug>/` (today's date). If that folder already exists from an
   earlier run today, suffix it `-2`, `-3`, … Use the **real folder name** everywhere below (provenance
   rule). Create the folder if absent.
2. Write `docs/vetting/<YYYY-MM-DD>-<slug>/roast-verdict.md`:

   ```markdown
   ---
   title: Roast Verdict — <idea, short>
   source_id: docs/vetting/<YYYY-MM-DD>-<slug>/roast-verdict.md
   path: docs/vetting/<YYYY-MM-DD>-<slug>/roast-verdict.md
   tags: [vetting, roast, verdict]
   updated: <YYYY-MM-DD>
   ---

   # Roast Verdict — <idea, short>

   **The brief:** <the one-paragraph brief the council judged>

   <the full verdict block exactly as shown to the user — GO/RESHAPE/KILL, confidence, the call,
   why, biggest risk, biggest upside, money read, the cheapest 48-hour test, the RESHAPE pivot>

   **Council scores:** Contrarian X/10 · Expansionist X/10 · Logician X/10 · Researcher X/10 · Buyer X/10

   <if a storm-research briefing was produced, link it:>
   **Evidence briefing:** ./<slug>-briefing.html
   ```
3. Index it in `docs/vetting/index.md` (relative to the project root; create it if absent with a
   `# Idea Vetting Log` heading + a table header `| date | idea | verdict | link |`): add one row — date ·
   idea · verdict · link to `roast-verdict.md` (and the briefing if present). This is a **standalone
   vetting log** — do NOT touch `docs/wiki/`.
````
(This drops HMA's `wiki/vetting.md`, the `wiki/index.md` cross-link, and the `outputs/change-log.md`
append — the whole old item 4.)

- [ ] **Step 3: Delete the "## Autonomous invocation (driven by `autopilot`)" section**

Remove that entire final section (DragonCandy has no `autopilot`, `wiki/charter.md`, or `web-researcher`).

- [ ] **Step 4: Repoint the roast→storm-research chain path (inside Step 5)**

`## Step 5` (offer the deep briefing) contains a second HMA path: the "On yes, and web access is available"
bullet tells `storm-research` to write into the **same** `outputs/vetting/<YYYY-MM-DD>-<slug>/` folder.
Repoint just that path — `outputs/vetting/<YYYY-MM-DD>-<slug>/` → `docs/vetting/<YYYY-MM-DD>-<slug>/`.
Leave the rest of Step 5's chain logic (the offer wording, the web-access check, the "What the briefing
changed" fold-in + the Evidence-briefing link) unchanged.

- [ ] **Step 5: Verify no HMA references remain, then commit**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" \
  && grep -nE "outputs/vetting|wiki/vetting|change-log|charter|autopilot|web-researcher|SUBAGENTS" .claude/skills/roast/SKILL.md \
  ; echo "exit=$?  (want: exit=1 / no matches)"
```
Expected: no matches (grep exit 1). If anything matches, fix it. Then:
```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" \
  && git add .claude/skills/roast/SKILL.md \
  && git commit -m "adapt(roast): project-relative docs/vetting persistence + strip HMA refs"
```

---

## Task 3: Adapt `storm-research/SKILL.md` (persistence + strip HMA refs)

**Files:**
- Modify: `.claude/skills/storm-research/SKILL.md`
- (Do NOT edit `report-template.html` — it stays verbatim.)

Keep the 5 lens prompts + "Return EXACTLY…" contracts, the contradiction map, Phase 4 verification, the
"Portability" and web-required pre-flight sections **unchanged**.

- [ ] **Step 1: Remove the Phase-1 `web-researcher` parenthetical**

In Phase 1, delete the italic parenthetical that begins `*(Each lens — and the Phase 4b citation
verifiers — may instead be dispatched as the `web-researcher` agent…` through `… See `docs/SUBAGENTS.md`.)*`.
Leave the surrounding "Spawn five `general-purpose` agents…" text intact.

- [ ] **Step 2: Repoint the Phase-3 write path (item 3)**

In `## Phase 3`, item 3, replace the sentence that writes to
`outputs/vetting/<YYYY-MM-DD>-{topic-slug}/{topic-slug}-briefing.html` with EXACTLY:

````markdown
3. Resolve the **project root** (`git rev-parse --show-toplevel`, else the current directory). Write to
   `docs/vetting/<YYYY-MM-DD>-{topic-slug}/{topic-slug}-briefing.html` (today's date; create the dated
   folder if needed). If `roast` commissioned this briefing, write into the **same**
   `docs/vetting/<YYYY-MM-DD>-{topic-slug}/` folder it already created. Same-day reruns suffix the folder
   `-2`, `-3`, …
````

- [ ] **Step 3: Repoint the Output section (final path + index; drop the change-log)**

In `## Output`:
- Item 1: change the final deliverable path from `outputs/vetting/…` to
  `docs/vetting/<YYYY-MM-DD>-{topic-slug}/{topic-slug}-briefing.html`.
- Item 3 ("Index it in the KB"): replace it entirely with EXACTLY:
  ````markdown
  3. **Index it.** Add a row to `docs/vetting/index.md` (relative to the project root; create it if absent
     with a `# Idea Vetting Log` heading + `| date | idea | verdict | link |` header): idea · date · verdict
     (if it came from a roast, else `—`) · link to this briefing. **Standalone vetting log — do NOT touch
     `docs/wiki/`.**
  ````
- Item 4 ("Log it." / `outputs/change-log.md` append): **delete it entirely**, and renumber the remaining
  item (the chat-summary item) accordingly.

- [ ] **Step 4: Delete the "## Autonomous invocation (driven by `autopilot`)" section**

Remove that entire final section.

- [ ] **Step 5: Verify no HMA references remain, then commit**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" \
  && grep -nE "outputs/vetting|wiki/vetting|wiki/index|change-log|charter|autopilot|web-researcher|SUBAGENTS" .claude/skills/storm-research/SKILL.md \
  ; echo "exit=$?  (want: exit=1 / no matches)"
```
Expected: no matches. (The "Portability" line's `.claude/skills/` reference is fine and stays.) Then:
```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" \
  && git add .claude/skills/storm-research/SKILL.md \
  && git commit -m "adapt(storm-research): project-relative docs/vetting persistence + strip HMA refs"
```

---

## Task 4: Verify (content gate + live smoke)

**Files:** none (verification only).

- [ ] **Step 1: Confirm the template is untouched**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" \
  && diff "C:/GIT/hma_project_foundation/.claude/skills/storm-research/report-template.html" \
          .claude/skills/storm-research/report-template.html && echo "TEMPLATE VERBATIM"
```
Expected: `TEMPLATE VERBATIM`.

- [ ] **Step 2: Confirm the adaptation diff touched only the plumbing**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git diff --stat HEAD~2 -- .claude/skills/
```
Expected: only the two `SKILL.md` files changed since the verbatim baseline; `report-template.html` = 0
changes. Eyeball `git diff HEAD~2 -- .claude/skills/roast/SKILL.md` to confirm the council personas +
verdict block are unchanged (only Step 4, the web note, and the autopilot section differ).

- [ ] **Step 3: Live smoke — `roast` (moderate cost: 5 parallel agents)**

Invoke `/roast a throwaway test idea: a paid newsletter that emails one obscure SQL tip per day`.
Expected: a GO/RESHAPE/KILL verdict in chat, AND a new
`docs/vetting/<today>-<slug>/roast-verdict.md` written under the **DragonCandy repo root** (because the
smoke runs here), AND a `docs/vetting/index.md` row. Confirm nothing was written to `outputs/vetting/` or
`wiki/vetting.md`:
```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && ls docs/vetting/ 2>&1 && test ! -e outputs/vetting -a ! -e wiki/vetting.md && echo "NO HMA PATHS"
```

- [ ] **Step 4: (Recommended, heavier) Live smoke — `storm-research`**

Web is available in this CLI. Optionally run `storm-research on: does a daily-SQL-tip newsletter have a
real market` on a tiny scope. Expected: a verified `<slug>-briefing.html` under
`docs/vetting/<today>-<slug>/`, an index row, and a truthful verification banner. Note this spawns ~9–11
agents + web — skip if cost-constrained; the content gate (Steps 1–2) already proves the persistence
adaptation. Either way, confirm the web pre-flight is intact (the skill would hard-stop with no web,
never fabricate).

- [ ] **Step 5: The smoke artifacts are NOT committed**

`docs/vetting/…` test output is untracked scratch — do **not** `git add` it. Leave it or delete it:
```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git status --porcelain docs/vetting/
```
Expected: only untracked (`??`) entries; the PR carries no vetting artifacts.

---

## Task 5: Install the global copies (`~/.claude/skills/`)

**Files:**
- Create (outside git): `~/.claude/skills/roast/`, `~/.claude/skills/storm-research/` (byte-identical copies)

- [ ] **Step 1: Copy the adapted skills into the global dir**

```bash
mkdir -p "C:/Users/dwill/.claude/skills" \
  && cp -r "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2/.claude/skills/roast" "C:/Users/dwill/.claude/skills/roast" \
  && cp -r "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2/.claude/skills/storm-research" "C:/Users/dwill/.claude/skills/storm-research" \
  && diff -r "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2/.claude/skills/roast" "C:/Users/dwill/.claude/skills/roast" \
  && diff -r "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2/.claude/skills/storm-research" "C:/Users/dwill/.claude/skills/storm-research" \
  && echo "GLOBAL COPIES IDENTICAL"
```
Expected: `GLOBAL COPIES IDENTICAL`. (If a global `roast`/`storm-research` already exists, STOP and ask —
do not overwrite.)

- [ ] **Step 2: Scope / precedence check**

Confirm the skills are discoverable and the project↔global name collision does not error. Inside
DragonCandy, `/roast` should resolve the **project** copy (precedence); from a different project, the
**global** copy runs and resolves `docs/vetting/` to *that* project's root. A quick, cheap check: start a
skill invocation for each and confirm it lists/loads without a duplicate-name error (you can cancel before
the full agent fan-out). No commit — the global dir is outside git.

---

## Task 6: Codex second review + finish the branch

- [ ] **Step 1: Codex second review**

Run the `codex-review` skill (`codex review --base main --title "Port roast + storm-research skills"` from
the worktree). This branch is docs/skills (markdown) only, so Codex may be light; act on any real finding,
re-run until clean, relay the verdict.

- [ ] **Step 2: Light knowledge touch (no wiki page needed)**

These are dev tooling, not a product feature — **no `docs/wiki/` concept page** (they aren't DragonCandy
knowledge). Add a one-line note to `docs/PROJECT_CONTEXT.md` (Active Workstreams or a "Tooling" mention)
that `roast` + `storm-research` were ported in (global-primary + committed copy), and commit it. Skip the
full `knowledge-sync` skill (no RAG-relevant content shipped).

- [ ] **Step 3: Finish the branch**

Use `finishing-a-development-branch`: push + open the PR (base `main`). The PR carries only the
`.claude/skills/{roast,storm-research}/…` files + the spec/plan + the PROJECT_CONTEXT line. Note in the PR
that the **global install is a local machine step** (outside the repo) and **Phase 2** (internal/AIOS Donny
+ Founder Playbooks) is deferred to its own spec.

---

## Verification summary (what "done" means)

1. `.claude/skills/roast/SKILL.md` + `.claude/skills/storm-research/SKILL.md` + `report-template.html`
   committed; template byte-identical to source; the two `SKILL.md` diffs touch only persistence + the
   HMA-ref strips (council/STORM prompts unchanged).
2. `grep` finds **no** `outputs/vetting|wiki/vetting|change-log|charter|autopilot|web-researcher|SUBAGENTS`
   in either `SKILL.md`.
3. Live `/roast` smoke wrote to `<repo>/docs/vetting/…` (project-relative), not HMA paths; no vetting
   artifacts committed.
4. Byte-identical global copies installed at `~/.claude/skills/`; no name-collision error.
5. Codex clean; a one-line PROJECT_CONTEXT note; PR opened. Phase 2 deferred.
