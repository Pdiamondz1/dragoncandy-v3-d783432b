---
title: make-validator skill (validator authoring meta-skill)
type: source
created: 2026-07-07
tags: [skills, loops, validators, aios, verification, self-improvement]
---
# make-validator skill — session source (2026-07-07)

## Origin

A YouTube explainer ("Finally. Agent Loops Clearly Explained.", AI Automation Society's *Build
Your AI OS with Claude Code* course) prompted a gap-audit of DragonCandy's existing AIOS against
the course's agent-loop framework. The audit found DragonCandy already implements the framework
(and is ahead on the "verification is the hard part" thesis via [[Validator Skills]]), with three
real gaps: (1) no loop observability surface, (2) the platform spend-cap is a dead control
(`donny-cost-rollup`), (3) **no `make-validator` meta-skill** — the documented *automate-last* step
from the 2026-06-20 validator-skills work, and Loop Scout's recurring "blocked on: author a
verify-* validator" finding. This session builds gap 3 (cheapest, most on-thesis, zero prod risk).

## What shipped

- **`.claude/skills/make-validator/SKILL.md`** — a project-scoped meta-skill that authors or
  retrofits validators to the ONE verdict contract (`{done, checklist:[{criterion,met}], missing:[]}`).
  Two modes: **NEW** (scaffold a fresh `verify-<slug>`) and **RETROFIT** (append the block to an
  existing judge skill). It encodes the easy-to-miss rules: the verdict block must be the LAST
  fenced block (what `aios-playbook-run`'s `parseDoneCheck` reads); only a deterministic rule may
  flip `met` (subjective judgment is advisory → `missing[]`); naming the dir `verify-<slug>` IS the
  Loop Scout integration (it globs `.claude/skills/verify-*`); a validator never writes the state it
  judges; BLOCKED (unreachable check) is `met:false`+note, not a silent pass. Ends with a self-check
  so an authoring run can't ship an unvalidated validator.
- **`.claude/skills/make-validator/MEMORY.md`** — seeded two-zone loop memory (Lessons + Run Log)
  per the [[Loop Memory Protocol]].
- **Dogfood — retrofit path:** `verify-prod` and `verify-db-schema` had a prose `## Done` section
  that Loop Scout already *counted* as a validator, but emitted **no machine-readable block**. Each
  now appends the verdict block with its gating checks explicit (verify-prod: bundle-changed /
  #root-mounted / console-errors=0 on both viewports; verify-db-schema: columns-exist-in-prod /
  RLS-allows-actual-actor / field-name-mismatches=0 / advisors-clean) and the subjective parts
  (visual/layout, "is this the right fix") kept advisory. Purely additive — nothing a human reads changed.
- **`docs/wiki/concepts/validator-skills.md`** — added an "Authoring & retrofitting validators"
  section pointing at `make-validator`, recorded the two retrofits, and cross-linked Loop Memory.

## Scope / invariants

- **Skills + docs only.** No schema, RLS, edge function, secret, or app code. No prod exposure.
- **Project-scoped, not global** — the meta-skill hardcodes DragonCandy's verdict contract, the
  `parseDoneCheck` parser, and Loop Scout's `verify-*` discovery, so it is project-coupled by the
  `feedback_skills_global_by_default` carve-out.
- Validators still **never write** the state they judge; the retrofits are additive/backward-compatible.

## Sequenced next (same founder request)

Gap 1 of 3. Next: **gap 2** — a read-only `/internal/loops` mission-control surface over all loops;
then **gap 3** — the AIOS spend source-of-truth (spec first) so the ≤15%-of-revenue AI-cost
kill-switch actually enforces.
