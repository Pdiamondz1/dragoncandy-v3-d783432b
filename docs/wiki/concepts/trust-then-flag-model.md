---
title: Trust-Then-Flag Model
type: concept
created: 2026-06-01
updated: 2026-06-01
sources: [raw/sessions/2026-06-01-dragonshare-amplification-engine.md, docs/superpowers/specs/2026-04-27-dragonshare-design.md]
tags: [moderation, ugc, dragonshare, mvp]
---

# Trust-Then-Flag Model

The content-moderation posture adopted for [[DragonShare]]: creator submissions go live
immediately (default status `verified`) with **no pre-publish review**, and safety is
handled post-hoc through a flag/report mechanism.

## Why

MVPs over-gate. An admin verification queue plus Donny scoring was specified in the original
DragonShare design, then deliberately **removed** — organic creator content rarely needs
pre-approval, and gating slowed go-live and hurt creator UX. The flag mechanism
(`flagged_at`/`flagged_by` on `dragonshare_posts`) is the safety valve: anything problematic
is taken down reactively rather than every post being blocked proactively.

## Evolution (flagged contradiction)

The earlier model (`docs/superpowers/specs/2026-04-27-dragonshare-design.md` as first drafted)
assumed an admin queue, scoring fields (`donny_score`, `donny_recommended_tier`,
`donny_reach_estimate`), and a submission limit. The shipped model **dropped all of these.**
This is a real product evolution, not a documentation error — older specs that mention the
admin queue describe a superseded design.

## Mechanics

- New posts default to `verified` (not `pending`).
- Reporting sets `flagged_at`/`flagged_by`; flagged posts are filtered out of browse surfaces.
- Declines are separate and additive (`declined_at`/`declined_by`) — a soft decline removes a
  post from the boost queue without deleting it, preserving the audit trail.

## See Also

- [[DragonShare]]
- [[Musk's Algorithm]]
- [[Data Flywheel]]
