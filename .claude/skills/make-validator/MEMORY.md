# make-validator — loop memory

> Read **Lessons** before every run; append a **Run Log** entry after every run.
> Full contract: docs/wiki/concepts/loop-memory-protocol.md

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)
- [contract] The verdict block MUST be the LAST fenced block in the produced validator's output —
  `aios-playbook-run`'s `parseDoneCheck` reads the last one. A trailing example fence anywhere
  after it silently becomes the parsed verdict.
- [determinism] The #1 authoring mistake is letting a subjective judgment gate `met`. Only a rule
  flips `met`; prose ("reads well", "looks clean") is advisory → goes in `missing[]`, never a
  `met`. This is the `verify-knowledge` lesson; enforce it in every validator produced.
- [discovery] Naming the dir `verify-<slug>` IS the integration — Loop Scout globs
  `.claude/skills/verify-*`. No registry edit needed; a wrong prefix means the validator is invisible.
- [retrofit] Retrofitting an existing judge skill (prose "Done" → append verdict block) is additive
  and backward-compatible — change nothing a human already reads. Prefer retrofit when a judge
  skill already exists (`verify-prod`, `verify-db-schema` were retrofits, not new authoring).
- [gitignore] After creating a new `verify-*/SKILL.md`, confirm `git check-ignore` returns nothing —
  the `.claude/skills/` ignore + negation stack has bitten new first-party skill files before (PR #161).

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)
### [2026-07-07] v1 authored + dogfooded on verify-prod / verify-db-schema
- Output: .claude/skills/make-validator/SKILL.md (this skill); retrofits appended to
  verify-prod/SKILL.md + verify-db-schema/SKILL.md; validator-skills.md updated. Branch
  feat/make-validator-skill.
- Happened: Built the meta-skill (NEW + RETROFIT modes) and dogfooded the RETROFIT path on the two
  judge skills Loop Scout already counted as validators but that emitted no machine-readable block.
- Worked: The retrofit was purely additive (appended a verdict-block section); no human-read content
  changed. Confirmed `git check-ignore` clears the new files.
- Failed: —
- Remember: `verify-prod`'s deterministic gates are bundle-changed / #root-mounted / console-errors=0
  (both viewports); layout/visual is advisory. `verify-db-schema`'s gates are columns-exist-in-prod /
  RLS-allows-actual-actor / field-name-match-empty / advisors-clean; "is this the right fix" is advisory.
