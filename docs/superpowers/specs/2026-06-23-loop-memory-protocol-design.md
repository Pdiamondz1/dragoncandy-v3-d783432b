# Loop Memory Protocol — Design

**Date:** 2026-06-23
**Status:** Approved (Phase 1 in scope; Phase 2 designed-but-deferred)
**Author:** Claude (brainstormed with Dame)

## 1. Problem & Context

A prompt (screenshot IMG_8329) proposed:

> *"Update my loop orchestration skill to write two files at the end of every run:
> (1) the actual Output (the document, code, or message the loop produced), and
> (2) a Memory file that logs what happened, what worked, what failed, and what to
> remember next run."*

DragonCandy AIOS already runs several orchestration loops, both as Claude Code skills
(`autoresearch`, `knowledge-sync`, `verify-knowledge`, `wiki-ops`) and as scheduled cloud
routines (`.claude/schedules/*.md` + edge functions). Exploring the current state surfaced
two facts that shape the design:

1. **The "Output" half already exists** for every loop. Each one persists its results
   today — `autoresearch`/`wiki-ops`/`knowledge-sync` write git-tracked artifacts under
   `docs/wiki/**` plus a `docs/wiki/log.md` ledger line; cloud routines write DB rows
   (`aios_playbook_runs.result_summary_md`, `aios_findings`, `aios_briefings`). A separate
   "Output file" would be redundant.

2. **No loop keeps a cross-run memory.** Nothing records "what worked / what failed /
   remember next run," and — critically — nothing is *read at the start* of the next run.
   The append-only `log.md` ledger is a history of *what was produced*, not a curated,
   acted-upon "apply this next time" guidance. That feedback loop is the missing piece.

**Intended outcome:** each participating loop reads a curated **Lessons** list *before*
running and, *after* running, appends a **Run Log** entry and promotes durable takeaways
into Lessons — so the loop self-improves over time instead of the operator re-explaining
the same correction every run. This is the concrete realization of the "self-improving app"
direction already documented in `docs/wiki/concepts/self-improving-app.md`.

## 2. Scope

**In scope (Phase 1):** markdown, git-tracked, skill-level loop memory for four skills.

**Explicitly NOT in scope:** any schema / RLS / edge-function / secret / frontend / DB
change. The consumer DragonCandy app has no loop-orchestration skills; this is a dev/AIOS
construct only. Phase 2 (DB-backed memory for cloud routines) is designed in §6 but **not
built** this pass.

### Non-goals (YAGNI)
- No new "Output file" — existing loop outputs satisfy that half of the prompt.
- No automation/hook to *enforce* memory writes — the skill instruction is the mechanism
  (consistent with how every other skill step works). A PreToolUse/Stop hook is a possible
  later hardening, not part of v1.
- No central memory registry — files are co-located with each skill.

## 3. The Memory file (two-zone)

Each participating skill gets one co-located file: `.claude/skills/<skill>/MEMORY.md`.
Co-location (not a central dir) keeps the memory version-controlled *with* the skill and
needs no registry. The file has exactly two zones:

```markdown
# <skill> — loop memory

> Read **Lessons** before every run; append a **Run Log** entry after every run.
> Full contract: docs/wiki/concepts/loop-memory-protocol.md

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)
- [<tag>] <durable, actionable guidance the loop should apply next time>

## Run log (append-only; newest first)
### [YYYY-MM-DD HH:MM] <one-line run label>
- Output: <pointer to where the output landed — e.g. docs/wiki/concepts/foo.md + log.md>
- Happened: <what the run did>
- Worked: <what went well>
- Failed: <what went wrong / was discarded / rejected>
- Remember: <takeaway; note "→ promoted to Lessons" when durable>
```

**Zone semantics:**
- **Lessons** — curated and *small*. The loop reads it at start and acts on it. Items are
  rewritten/pruned as they're superseded; this is the "what to remember next run" half.
- **Run log** — append-only, newest first, one entry per run. This is the "logs what
  happened" half, kept for auditability. Older entries may be trimmed/archived if the file
  grows unwieldy (a soft cap, see §5), but Lessons are never lost to trimming.

**Output reference, not duplication:** the `Output:` line *points at* the artifact the
loop already produces (wiki page path, `log.md` entry, PR, or — in Phase 2 — a DB row id).
No second copy of the output is written.

## 4. The protocol (defined once, referenced everywhere)

To avoid duplicating the contract across four SKILL.md files (wiki principle: *compound,
don't duplicate*):

- **One concept page** — `docs/wiki/concepts/loop-memory-protocol.md` — is the single
  source of truth. It specifies the two-zone file shape, the read-first/append-after
  contract, the "Output is a pointer" rule, and how the validator verdict block feeds the
  Failed/Remember zone. It carries standard wiki frontmatter and `[[wikilinks]]` to
  `[[Validator Skills]]` and `[[Self-Improving App]]`, is added to `index.md`
  (alphabetical), and gets a `log.md` entry — per `docs/KNOWLEDGE_WIKI.md`.

- **Each participating SKILL.md** gets a short, identical **"Loop memory"** block that
  says, in effect: *"Before running, read `MEMORY.md` Lessons and apply them. After
  running, append a Run Log entry and promote durable takeaways into Lessons. Full
  contract: `docs/wiki/concepts/loop-memory-protocol.md`."* The block is copy-pasteable so
  fan-out is mechanical.

### Reuse of the verdict contract
For validator-backed loops, the structured "what failed" signal already exists: the verdict
block `{done, checklist:[{criterion,met}], missing:[]}` from
`docs/wiki/concepts/validator-skills.md`. The protocol states that, when a loop has a
verdict, its `missing[]` items are the natural source for the Run Log **Failed/Remember**
zone — no new failure-capture format is invented.

## 5. Per-skill application

| Skill | Memory value | Notes |
|-------|--------------|-------|
| `autoresearch` (pilot) | Which topic types/sources the acceptance gate keeps vs discards; recurring thin-coverage areas | Richest cross-run signal; loop already iterates against `index.md`/`log.md`. Add the read step near "Read `docs/wiki/index.md` before any run" and the write step alongside the existing `log.md` ledger write. |
| `knowledge-sync` | What core docs needed refresh last time; recurring RAG-sync gotchas | Pairs with `verify-knowledge`; `missing[]` feeds Failed zone. |
| `verify-knowledge` | Recurring lint/freshness failure modes | Validator is read-only for *its target*, but writing its own `MEMORY.md` is allowed — memory is the skill's own bookkeeping, not a write to the state under test. The protocol notes this exception explicitly. |
| `wiki-ops` | Recurring ingest/categorization decisions, frequent orphan sources | Foundational ingest skill the others call. |

**Soft size cap:** the concrete rule is **~30 Run Log entries** — past that, trim the
oldest Run Log entries (never the Lessons zone). The underlying reason is to keep the
read-at-start context cost bounded; the entry count is the threshold to measure, not a
second independent "file size" trigger.

**Start-of-run anchor (fan-out note):** `autoresearch` has a verified anchor for the read
step — its "Read `docs/wiki/index.md` before any run" line — and a verified anchor for the
write step (its existing `log.md` ledger write). For `knowledge-sync`, `verify-knowledge`,
and `wiki-ops` the identical "Loop memory" block still applies, but the implementer must
locate each file's natural start-of-run step to attach the read instruction (the block is
identical; only its insertion point is per-file). This is the one place fan-out is not
purely mechanical.

## 6. Phase 2 (DESIGN ONLY — not built this pass)

For the AIOS **cloud scheduled routines**, the same two-zone contract goes DB-backed so the
report-only-autonomy invariant holds:

- A lightweight table `aios_loop_memory(loop_key text primary key, lessons_md text,
  updated_at timestamptz)` — one curated-Lessons row per loop. (Run Log history is already
  covered by existing run/finding rows, so Phase 2 may only need the Lessons row.)
- The agent writes its updated Lessons **through the existing `aios-report-ingest` choke
  point** (a new `type: "loop_memory"` payload) — agents never write tables directly.
- Each scheduled-routine prompt (`.claude/schedules/*.md`) reads its `lessons_md` at the
  start of the run and applies it.

Admin-only RLS, additive migration, one edge-function deploy, Codex pass — deferred until
the markdown version is proven.

## 7. Risks & mitigations

- **Memory rot / contradiction** — stale Lessons could mislead a run. Mitigation: Lessons
  are curated (rewritten/pruned), not append-only; the loop is instructed to prune
  superseded items as part of the write step.
- **Context bloat** — large `MEMORY.md` read every run. Mitigation: soft size cap (§5),
  trim Run Log not Lessons.
- **Instruction not followed** — a run skips the read/write. Mitigation: the block is a
  first-class loop step (same enforcement as every other skill step). A Stop hook is the
  documented later hardening, not v1.
- **Scope creep into the consumer app** — none; this is dev/AIOS only, no app surface.

## 8. Verification

1. `npm run lint` clean; the new concept page is listed in `docs/wiki/index.md` and has a
   `docs/wiki/log.md` entry.
2. **Pilot dry-run:** `/autoresearch <small topic>` — the run mentions/reads `MEMORY.md`
   Lessons at start and writes a new Run Log entry (+ any promoted Lessons) at end; the
   `Output:` line points at the real wiki page/`log.md` it produced; no redundant Output
   file is created.
3. **Second run learns:** a subsequent `/autoresearch` references the Lessons left by the
   first run (feedback loop closed, not just appended).
4. **Fan-out consistency:** all four `MEMORY.md` files exist and all four SKILL.md files
   carry the identical "Loop memory" block.
5. `git diff --stat` touches only `.claude/skills/**` and `docs/wiki/**` (+ this spec) —
   no DB/edge-fn/frontend diff.
6. Codex second review (`codex review --base main`) clean before PR, per repo rule.

## 9. Files

- **New:** `docs/wiki/concepts/loop-memory-protocol.md`
- **New:** `.claude/skills/{autoresearch,knowledge-sync,verify-knowledge,wiki-ops}/MEMORY.md`
- **Edit:** `.claude/skills/{autoresearch,knowledge-sync,verify-knowledge,wiki-ops}/SKILL.md`
- **Edit:** `docs/wiki/index.md`, `docs/wiki/log.md`
- **Reference (unmodified):** `docs/wiki/concepts/validator-skills.md`, `docs/KNOWLEDGE_WIKI.md`
