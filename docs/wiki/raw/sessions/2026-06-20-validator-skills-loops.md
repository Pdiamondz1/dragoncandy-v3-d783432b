# Session: Validator Skills → Closeable Loops (2026-06-20)

## What shipped
Turned DragonCandy's prose-emitting "judge" skills into a basis for **closeable loops** by
standardizing one machine-readable verdict contract and proving it with one live loop.

- **Validator Verdict contract** (`docs/wiki/concepts/validator-skills.md`): a validator skill
  ends its output with a fenced JSON block `{done, checklist:[{criterion,met}], missing:[]}` —
  the SAME shape Founder Playbooks `done_check` uses, so `aios-playbook-run`'s `parseDoneCheck`
  reads it with **no new code**. One contract spans cloud playbooks and skill-level loops.
- **`verify-knowledge`** (new validator skill, `.claude/skills/verify-knowledge/SKILL.md`):
  read-and-judge only (never writes). Three deterministic checks → one verdict block:
  (a) wiki-ops lint critical count, (b) RAG freshness vs `LAST_WIKI_SYNC`
  (concepts/entities/analyses) with the >24h window and the "exit code is the success
  authority" caveat carried verbatim from `knowledge-freshness-agent`, (c) index/log currency
  for the session's pages (the substantive "core docs reflect work" judgment is advisory-only,
  never a gating `met`, so the verdict stays deterministic).
- **`knowledge-sync` loop close**: after generating, it runs `verify-knowledge`, applies
  `missing[]` on `done:false`, and re-verifies — bounded to 3 iterations. Mirrors how
  `codex-review` self-loops fix→re-run.
- **Loop Scout** (`.claude/schedules/loop-scout-agent.md`): now enumerates `.claude/skills/verify-*`
  and scores 4-Condition-Test condition #2 ("rule judges done?") by validator presence — a
  candidate with a matching validator is build-ready; one without is "blocked on: author a
  verify-* validator skill first." Closes the loop on Loop Scout itself.

## Key decisions
- **Reuse `done_check`, don't invent a new shape.** Zero new parser; one contract everywhere.
- **Validators never write.** The only write in the knowledge loop stays the idempotent RAG
  sync through the existing `donny-knowledge-sync` choke point. *A human merges wiki first* holds.
- **Deterministic gating only.** Check (c) was scoped down from "do the core docs reflect the
  work" (prose judgment) to index/log presence (a rule), with the prose concern surfaced as a
  non-gating advisory — a validator's `met` must be reproducible.
- **Scope discipline:** built only the contract + knowledge loop. Six other judge-capable
  skills (verify-db-schema, verify-prod, codex-review, autoresearch gate, etc.) are documented
  as ranked next-loops; a `make-validator` meta-skill is the explicit deferred *automate-last* step.

## Gotchas / discoveries
- **The validator earned its keep on run 1.** Its first real run returned `done:false` because
  it caught two genuine pre-existing orphans — `analyses/here-s-the-exported-doc-...nyc-media.md`
  and `analyses/part-1-the-human-marketing-team.md` (Donny save-answer captures from PR #139 /
  2026-06-18) that were on `origin/main` but never added to `index.md`. The loop closed in 2
  iterations after adding their index entries. Suggests the **wiki-save-answer flow doesn't
  update `index.md`** — a separate follow-up.
- **Check (a) is global, not session-scoped:** any pre-existing whole-wiki lint defect makes a
  session's verdict `done:false` until fixed. Correct ("the layer isn't clean") but couples a
  session to pre-existing debt — worth noting if it becomes friction.
- The work was developed on the `wiki-donny-chat-ux` worktree branch, then cherry-picked onto a
  clean `validator-skills-loops` branch off `origin/main` to keep PR scope focused (a leftover
  Donny-chat wiki ingest commit, `562c2d2a`, remained on the original branch for separate handling).

## Affected files
- New: `.claude/skills/verify-knowledge/SKILL.md`, `docs/wiki/concepts/validator-skills.md`,
  `docs/superpowers/specs/2026-06-20-validator-skills-loops-design.md`,
  `docs/superpowers/plans/2026-06-20-validator-skills-loops.md`
- Edited: `.claude/skills/knowledge-sync/SKILL.md`, `.claude/schedules/loop-scout-agent.md`,
  `docs/wiki/index.md`, `docs/wiki/log.md`
- No schema, RLS, edge function, secret, or auth/payment changes.
