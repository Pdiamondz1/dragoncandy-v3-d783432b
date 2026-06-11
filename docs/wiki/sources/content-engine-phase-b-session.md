---
title: Content Engine Phase B Session
type: source
created: 2026-06-11
updated: 2026-06-11
sources: [raw/sessions/2026-06-11-035313-content-engine-phase-c-performance-loop.md]
tags: [content-engine, donny, dragonshare, content-briefs, deep-link, session]
---

# Content Engine Phase B Session

Session of 2026-06-11 that shipped and verified **Content Engine Phase B** end-to-end in prod —
the forward half of the self-improving content loop (signals → brief → action) — across three
agile slices plus a late race-condition fix. See [[Content Engine]] for the synthesized system and
[[Self-Improving App]] for the surrounding vision.

## One-paragraph summary

A content creator can now pick a restaurant on their dashboard and have [[Donny AI]] return a
structured **content brief** (Slice 1, persisted to `content_briefs`), then act on it with one tap:
**"Make it & submit"** deep-links into [[DragonShare]] with the restaurant pre-selected and the
brief→submission link recorded (Slice 2, `dragonshare_posts.source_brief_id`), and the submit form's
**caption field arrives pre-filled and editable** from the brief's `sample_caption` + hashtags
(Slice 3, `dragonshare_posts.caption`). Proven by a real prod row (`79d42758`, Uncle Rocco) carrying
both `source_brief_id` and the edited caption. The work followed the brainstorm → spec → plan →
subagent-driven implementation → prod-verify discipline per slice (PRs #60–#63).

## Key claims

- **Phase B is built and verified; Phase C (the return half) is not.** The reserved column
  `content_briefs.social_post_log_id` exists but is never populated — bridging a *published* post's
  engagement back to the brief is the next workstream.
- **A deep-link query race silently broke two slices.** `usePreselectedOrg` keyed its org lookup on
  the **live** `?restaurant=` URL param; a cleanup effect deleted that param the moment `org`
  resolved, re-keying/disabling the query so `org` reverted to `undefined` before the sibling brief
  query resolved. The brief→org match therefore never held simultaneously, so the caption never
  seeded **and** `source_brief_id` was never recorded — for both Slice 2 and Slice 3. Fix (PR #63):
  capture deep-link params at mount and key queries on the captured value. See
  [[Deep-Link Param Query Race]].
- **The UI masked a dead data link.** The restaurant pre-fill survived (the submit form captures it
  during the one render `org` was truthy), so the page *looked* correct while the recorded link was
  null. Verifying the DB — not just the UI — is what caught it.
- **No migrations for Slices 2–3.** `source_brief_id` and `caption` columns already existed; Slice 2
  shipped the caption insert, so Slice 3's mutation change was a one-line type widen.
- **Identity key is `organizations.id` throughout.** `content_briefs.organization_id` =
  `dragonshare_posts.target_org_id` = the id `get_restaurant_by_org_id` / `search_restaurants` return.

## Notable specifics

- PRs: #60 (Slice 1), #61 (Slice 2), #62 (Slice 3), #63 (race fix). All merged; origin/main, local
  main, and the worktree synced to `ee3334e4`.
- Caption pre-fill semantics: a restored sessionStorage **draft wins** over the brief prefill (the
  `seededCaptionRef` initializes from the draft), so a creator's typed-then-navigated caption isn't
  clobbered.
- Verification row: `dragonshare_posts.id = 79d42758-e7f6-46b0-84e0-633c0f6e3e0a` (prod
  `zocahiffooqdybdhguqv`).

## See Also

- [[Content Engine]]
- [[Self-Improving App]]
- [[Deep-Link Param Query Race]]
- [[DragonShare]]
- [[Donny AI]]
- [[Content Engine Data Audit]]
