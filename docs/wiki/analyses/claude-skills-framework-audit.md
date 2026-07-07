---
title: Claude Skills Framework Audit
type: analysis
created: 2026-07-07
updated: 2026-07-07
sources: [https://www.youtube.com/watch?v=3UWxMPUko1k, https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills]
tags: [skills, claude-code, aios, donny, audit]
---
# Claude Skills Framework Audit

Applies Anthropic's public playbook for building Claude Code **Skills** — the
[9-category framework talk](https://www.youtube.com/watch?v=3UWxMPUko1k) and the
[lessons-from-building-Claude-Code post](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills)
— to DragonCandy's own two "skill" surfaces: the dev/AIOS `.claude/skills/` library and **Donny**
(the product agent). Audit-first: this page is the **map**, ending in a value×effort-ranked backlog.
Each backlog item becomes its own brainstorm→spec→plan sub-project; only the single top quick win
ships in the same cycle as this audit.

## The framework (recap)

The talk's load-bearing ideas:

- **9 categories** — a good skill fits *exactly one*; straddling several is a smell and a gap-finder.
  Library/API reference · Product verification · Data fetching/analysis · Business process ·
  Code scaffolding · Code quality/review · CI-CD/deployment · Runbooks · Infrastructure ops.
- **Gotchas are the highest-signal content** — built from real failure points, not the happy path.
- **Progressive disclosure** — `SKILL.md` is a table-of-contents/signpost; detail lives in linked
  files loaded on demand.
- **Descriptions written for AI discovery** — say *when to trigger* (concrete phrases), not a human
  summary.
- **Bundled scripts**, **memory across runs**, **composition** (orchestrate, don't rebuild
  boilerplate), **non-redundancy** (teach novel project-specific info, not what Claude already knows),
  and on-demand **safety skills** (`/careful`-style) for dangerous ops.

## The rubric

Every skill / Donny surface is scored **pass / partial / fail** on 7 criteria (one-line reason each);
`N/A` where a criterion structurally cannot apply (never scored as `fail`):

1. **Single category** — fits exactly one of the 9.
2. **Gotchas** — explicit, failure-point-driven (not happy-path).
3. **Progressive disclosure** — `SKILL.md` is a signpost; detail in linked files/memory.
4. **AI-discovery description** — says *when to trigger*, with concrete phrases.
5. **Bundled scripts** — executables for deterministic steps vs prose to re-derive.
6. **Memory across runs** — Loop Memory Protocol / a log.
7. **Non-redundant** — novel project-specific info.

Honesty gate: an all-green scorecard across 12 surfaces is not credible. Every `partial`/`fail`
generates a backlog item; criterion-1 failure (straddling categories) is a decomposition signal.

## Dev-library scorecard

<!-- Task 2 -->

## 9-category coverage matrix

<!-- Task 2 -->

## Donny audit

<!-- Task 3 -->

## Ranked backlog

<!-- Task 4 -->

## See Also

<!-- Task 4 -->
