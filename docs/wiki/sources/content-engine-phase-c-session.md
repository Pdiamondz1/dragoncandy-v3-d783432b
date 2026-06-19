---
title: Content Engine Phase C Session
type: source
created: 2026-06-11
updated: 2026-06-11
sources: [docs/superpowers/specs/2026-06-11-content-engine-phase-c-design.md]
tags: [content-engine, donny, dragonshare, content-briefs, social-post-log, performance, triggers, rls, session]
---

# Content Engine Phase C Session

The 2026-06-11 work that built and shipped **[[Content Engine]] Phase C** — the *return half* of
the self-improving content loop. Phase A (performance capture) and Phase B (brief → DragonShare
action) had wired everything **forward**; Phase C closed the loop by linking a brief-originated
post's real engagement back to the brief, so Donny can learn which briefs produced content that
actually performed. Data-link-only, no UI. Shipped and verified in prod as **PR #73**. See
[[Content Engine]] for the synthesized system and [[Self-Improving App]] for the surrounding vision.

> **Provenance note.** Unlike [[Content Engine Phase B Session]] and
> [[Content Engine Phase D Session]], the Phase C build did not produce its own
> `.claude/handoffs/` document or `raw/sessions/` transcript — it fell between the Phase-B-complete
> handoff (`2026-06-11-035313-…`, which anchors the Phase B source page) and the Phase D handoff
> (`2026-06-11-142417-…`). This source page is therefore anchored on the **approved spec**
> (`docs/superpowers/specs/2026-06-11-content-engine-phase-c-design.md`, a git-tracked source doc)
> and the synthesized [[Content Engine]] concept page, created retroactively so Phase C is traceable
> as a source rather than visible only inside the concept synthesis. (Filed to close the exact gap
> that the `handoff-wiki-archive-always` discipline now guards against — see
> [[Content Engine Phase D Session]].)

## One-paragraph summary

Before Phase C the loop had exactly one missing link: when a brief-originated DragonShare post was
finally published, nothing connected the published post back to the brief, so
`content_briefs.social_post_log_id` was **always null** and the engagement a brief produced was
invisible to the engine that generates the next brief. The resolved gating unknown was *when* a
`social_post_log` row is even created: the boost itself does **not** write one — only a human
clicking **"Post Now"** on the boost auto-draft does (`fire-dragonshare-social-hook` →
`donny_scheduled_posts` → `DonnyProvider.publishDraft`). Phase C's fix is data-link-only: the
frontend writes the originating dragonshare `post_id` it already holds into a new
`social_post_log.dragonshare_post_id` column; a **BEFORE INSERT** trigger resolves `source_brief_id`
from that post; an **AFTER INSERT** trigger sets `content_briefs.social_post_log_id` **first-wins**;
and `content-performance-capture` forwards `source_brief_id` onto `content_performance`. The work
followed the brainstorm → spec → plan → subagent-driven implementation → staging-probe →
gated-prod-promotion → verify discipline.

## Key claims

- **The boost does not create a `social_post_log` row — the human "Post Now" click does.** This was
  the gating unknown the Phase B handoff flagged. Resolution: `fire-dragonshare-social-hook` drafts
  posts into `donny_scheduled_posts` (`metadata.post_id` = `dragonshare_posts.id`, one draft per
  connected party); `DonnyProvider.publishDraft` POSTs Outstand and inserts `social_post_log`. The
  link must form at that publish moment.
- **Triggers, not a frontend write or an edge function.** `content_briefs` has **no user-facing
  UPDATE policy** (service-role writes only), so the browser cannot set `social_post_log_id`. Two
  `SECURITY DEFINER` triggers (`SET search_path = public`, by-PK, no dynamic SQL) perform the
  RLS-safe cross-table write. Resolving at *publish time* from the source of truth (vs. denormalizing
  the brief id into draft metadata earlier) keeps one authoritative source and needs **no**
  `fire-dragonshare-social-hook` change.
- **One-to-many performance, single-FK convenience pointer.** A brief can spawn many published posts
  (restaurant + creator + brand, each cross-posted). So `source_brief_id` is carried onto
  `social_post_log` *and forward onto* `content_performance` → "brief performance" = ALL posts
  tracing to the brief; the single `content_briefs.social_post_log_id` FK is set **first-wins**
  (`WHERE social_post_log_id IS NULL`) to satisfy the existing column. Sibling publishes are no-ops
  on the FK but still carry `source_brief_id`.
- **SECURITY DEFINER trigger fns revoke EXECUTE from public/anon/authenticated.** A definer function
  in `public` is otherwise callable via `/rest/v1/rpc/<fn>` (Supabase advisors 0028/0029); trigger
  functions need no such grant, so both revoke it. (The Phase D *read* RPC is the contrast case — it
  keeps the `authenticated` grant because the frontend calls it; the `auth.uid()` predicate is the
  authorization.)
- **No `pg_net`/GUC dependency.** The triggers are plain plpgsql `UPDATE`s, so the known
  dead-GUC-from-trigger gotcha does not apply.

## Notable specifics

- **Migration:** `social_post_log.dragonshare_post_id` + `.source_brief_id` (both
  `REFERENCES … ON DELETE SET NULL`), `content_performance.source_brief_id`, indexes on
  `source_brief_id`, and the two trigger functions `resolve_social_post_log_brief()` (BEFORE) +
  `link_brief_to_social_post()` (AFTER).
- **Frontend one-liner:** `publishDraft` adds `dragonshare_post_id` to the `social_post_log` insert,
  guarded to `draftMetadata?.source === 'dragonshare_social_hook'` so other draft sources never
  mis-populate it.
- **Edge fn:** `content-performance-capture` adds `source_brief_id` to its `social_post_log`
  `.select(...)` and row map; deployed via Supabase CLI from the worktree (sibling `capture.ts`, no
  `_shared` imports).
- **Deploy ordering:** prod migration applied *before* the edge-fn deploy + frontend merge, so the
  daily cron `select`/`insert` and the frontend insert don't fail on the missing column. (Project
  memory: `deploy-ordering-new-column`.)
- **Known limit (by design):** the link only forms if a human actually clicks "Post Now"; an ignored
  draft leaves `social_post_log_id` null. And it populates only once a real boost + publish happens —
  which is why the Phase D card is still empty in prod today.

## See Also

- [[Content Engine]] — the loop + all four phases (C = the return-half link)
- [[Self-Improving App]] — Phase 6 (Content Engine); Phase C closed the loop server-side
- [[Content Engine Phase B Session]] — the prior build session (the forward half)
- [[Content Engine Phase D Session]] — the next session (surfaced the loop to creators)
- [[DragonShare]] — the submission/publish path the link rides through
- [[Content Engine Data Audit]] — why the downstream tables are still partial in prod
