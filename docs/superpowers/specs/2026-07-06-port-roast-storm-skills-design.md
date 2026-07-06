# Port `roast` + `storm-research` skills into DragonCandy (+ Donny follow-up)

- **Date:** 2026-07-06
- **Branch:** `feat/port-roast-storm-skills` (worktree `DC-2`)
- **Status:** design approved (founder)

## Context

Two well-built skills already exist in the sibling repo `C:/GIT/hma_project_foundation`
(`.claude/skills/roast/` and `.claude/skills/storm-research/`). The founder wants them available in
DragonCandy **as dev `/skills`** and, later, **on the internal/AIOS Donny + Founder-Playbooks surface**
— sequenced **dev skills first, Donny second**.

- **`roast`** — convenes a 5-persona council (Contrarian / Expansionist / Logician / Researcher /
  Buyer) run as 5 parallel `general-purpose` agents, then the invoking model acts as Judge and returns
  one **GO / RESHAPE / KILL** verdict + confidence, biggest risk/upside, a money read, and *the cheapest
  48-hour test*. Self-contained (one `SKILL.md`). Degrades gracefully with no web (the Researcher reasons
  from general knowledge + flags it).
- **`storm-research`** — a 4-phase STORM pipeline: 5 expert lenses (Practitioner / Academic / Skeptic /
  Economist / Historian) as parallel agents → contradiction map → a self-contained HTML briefing rendered
  from `report-template.html` → adversarial peer review + **primary-source citation verification**.
  **Hard-requires web** (WebSearch/WebFetch), spawns ~9–11 agents, refuses to fabricate.

The skills are portable by design ("drop the folder into any `.claude/skills/`"), but their **persistence
layer assumes HMA's file layout** — `outputs/vetting/<date>-<slug>/`, a top-level `wiki/vetting.md`
index, and `outputs/change-log.md` — none of which exist in DragonCandy (whose knowledge layer is
`docs/wiki/` with a strict schema). A naive copy would spawn foreign top-level `outputs/` + `wiki/`
folders that clash with the repo and confuse the wiki tooling. **This port keeps the "brains" verbatim
and rewires only the plumbing.**

## Scope (founder-confirmed)

- **Phase 1 (build now):** both skills as DragonCandy dev `/skills`.
- **Phase 2 (deferred, design sketch only):** the internal/AIOS Donny + Founder-Playbooks surface.
- Consumer Donny is **out of scope** (founder chose internal/AIOS + Playbooks).

## Phase 1 — the two dev `/skills`

### Ported verbatim (the value — do not rewrite)
- **roast:** the council personas + their exact prompts, the 5-parallel-agent dispatch, the Judge step,
  and the GO/RESHAPE/KILL verdict block + the cheapest-48h-test.
- **storm-research:** the 5 lens prompts + "Return EXACTLY…" output contract, the contradiction map,
  Phase 3 synthesis, Phase 4 adversarial peer-review + per-citation verification, and
  **`report-template.html` byte-for-byte** (keep the CSS verbatim).
- The **roast → storm-research chain** (roast Step 5 offers the deep briefing). Web tools are available
  in this CLI, so both run.

### Adapted — persistence repointed to a DragonCandy-native home
Replace HMA's `outputs/vetting/` + `wiki/vetting.md` + `outputs/change-log.md` with:
- **Artifacts:** `docs/vetting/<YYYY-MM-DD>-<slug>/` — `roast` writes `roast-verdict.md`; `storm-research`
  writes `<slug>-briefing.html`; same-day reruns suffix `-2`, `-3`. (When `roast` commissions a briefing,
  `storm-research` writes into the **same** dated folder — behavior preserved, only the base path changes.)
- **Index:** `docs/vetting/index.md` — a simple standalone log (one row per run: date · idea · verdict ·
  links). Created on first run with a short header. **Deliberately NOT under `docs/wiki/`** — vetting
  artifacts are decision records, not knowledge-wiki concepts/entities/analyses, so they stay out of the
  strict wiki schema and its RAG sync. (No `wiki/index.md` cross-link step.)
- **Change log:** **dropped** — DragonCandy uses git log; the per-run `outputs/change-log.md` append is
  removed.
- Keep `roast-verdict.md`'s YAML frontmatter (`title`/`source_id`/`path`/`tags`/`updated`) but repoint
  `source_id`/`path` to the `docs/vetting/…` location. (The storm briefing is a standalone **HTML** file
  with no YAML frontmatter — nothing to repoint there beyond its output path.)

### Adapted — HMA-only references stripped (self-consistency)
DragonCandy has no `autopilot` skill, no `wiki/charter.md`, no `web-researcher` agent, no
`docs/SUBAGENTS.md`. Remove:
- Both skills' **"Autonomous invocation (driven by `autopilot`)"** sections (dead code here).
- The `web-researcher` agent optionality → keep `general-purpose` (available in DragonCandy) as the sole
  dispatch agent for the council/lenses/verifiers.
- `roast`'s `wiki/charter.md` brief-source (only used by autopilot).
Keep the web-availability pre-flights (roast degrades; storm-research hard-stops) unchanged.

### `.gitignore` — verified NOT an issue (no change needed)
An earlier read suggested DragonCandy's `.gitignore` re-includes **only** `SKILL.md` + `*/MEMORY.md` under
the ignored `.claude/skills/`, which would silently drop `storm-research/report-template.html`. **Verified
empirically false in the current repo:** the existing re-includes `!.claude/skills/` + `!.claude/skills/*/`
(lines 81–82) already make **every** file directly under a new `.claude/skills/<name>/` folder trackable.
`git check-ignore -v .claude/skills/storm-research/report-template.html` returns nothing (exit 1), and a
`git add --dry-run` on a new skill dir stages **both** `SKILL.md` and `report-template.html`. So **no
`.gitignore` change is needed** — the footgun was the *pre-fix* state (before lines 81–82 existed;
line 83's explicit `*/MEMORY.md` is now redundant belt-and-suspenders). Phase 1 is therefore purely
additive skill files, touching no shared config.

### Files (Phase 1)
- **Create:** `.claude/skills/roast/SKILL.md` (ported + persistence/refs adapted);
  `.claude/skills/storm-research/SKILL.md` (ported + adapted) + `.claude/skills/storm-research/report-template.html`
  (verbatim copy). `docs/vetting/` is **created by the skills on first run** (not pre-created) — nothing to
  add there now.
- **No shared-config change** — no `.gitignore` edit (verified above), no migration, no edge function.
- No `MEMORY.md` for either (they are on-demand, not loop skills — matches the source).

## Phase 2 — internal/AIOS Donny + Founder Playbooks (deferred; design sketch)

Built later as its own spec/plan. The edge-function runtime differs fundamentally from the CLI (no
parallel-subagent fan-out, no web), so this is an **adaptation, not a copy**:

- **`roast` → a report-only Founder Playbook** (e.g. `roast-idea`): a seed playbook on the existing
  `aios-playbook-run` rail. Because the runner is a single edge-function LLM pass (it can't spawn 5
  parallel subagents), the council is simulated **in one run** — the model role-plays all five personas
  sequentially, then judges. Report-only; if the verdict implies a strategy-doc change it may `propose_correction`
  through the existing `/internal/corrections` gate. **No new infra** (pure seed migration on the
  playbook rail) — the lighter half of Phase 2.
- **`storm-research` → the heavy half:** real STORM needs web access, which `aios-playbook-run` and Donny
  lack. Options (decide in the Phase 2 spec): (a) a **new `donny-web-research` edge function** wrapping a
  web-search API (Brave/Serper/Tavily) + a Donny/playbook tool + a new secret + cost accounting, or (b) a
  degraded **RAG-only** "storm" over `donny_knowledge` (not true STORM, no external sourcing). This is the
  meaningful build being deferred.

Phase 2 is **not** built in this branch; the sketch exists so Phase 1's dev skills are designed with the
eventual Donny surface in mind.

## Build / verify (Phase 1)
1. Copy `report-template.html` verbatim; confirm it is trackable with **no** `.gitignore` change —
   `git add --dry-run .claude/skills/storm-research/` stages both `SKILL.md` and `report-template.html`
   (and `git status` shows the new skill dirs as `??`, not ignored). storm-research's own SKILL.md
   self-description ("depends only on… plus `report-template.html` in this same folder… drop the folder
   into any `.claude/skills/`") stays **true verbatim** in DragonCandy — leave that line unedited.
2. Both `SKILL.md` files: confirm the persistence steps point to `docs/vetting/…`, the change-log/charter/
   autopilot/web-researcher references are gone, and the core council/STORM prompts are unchanged from source.
3. Smoke `roast`: `/roast <a throwaway idea>` → a GO/RESHAPE/KILL verdict in chat + `docs/vetting/<date>-<slug>/roast-verdict.md`
   + a `docs/vetting/index.md` row. (Council runs 5 parallel agents; verify no HMA-path write attempts.)
4. Smoke `storm-research` on a small topic (web available) → a verified `<slug>-briefing.html` under the
   same dated folder + an index row + the verification banner is truthful. Confirm it **hard-stops** if web
   is disabled rather than fabricating.
5. `npm run build` is irrelevant (skills are markdown) — no app code changes. `codex review --base main`
   (docs/skills only; Codex may be light) then finish the branch.

## Invariants / safety
- **Port the brains, not rewrite them** — council personas, STORM lenses, verdict/report shapes, and the
  HTML template are copied faithfully; only paths + HMA-specific references change.
- **storm-research never fabricates** — the web-required pre-flight + Phase 4 verification are preserved.
- **Vetting artifacts are decision records, not wiki knowledge** — they live in `docs/vetting/`, never in
  `docs/wiki/` (no RAG sync, no wiki-schema pollution).

## Deferred (out of scope for this branch)
Phase 2 (both Donny surfaces); consumer Donny entirely; any web-research edge function; an `autopilot`
loop; folding storm-research into `autoresearch` (it stays a distinct skill).
