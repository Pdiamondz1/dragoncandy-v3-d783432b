# Handoff: Content Engine Phase B complete — next up the performance half of the loop (Phase C)

## Session Metadata
- Created: 2026-06-11 03:53:13
- Project: C:\GIT\dragoncandy-v3-d783432b (work in worktree .claude\worktrees\autoresearch)
- Branch worked: feat/content-brief-recommender, feat/brief-to-dragonshare-cta, feat/caption-prefill, fix/brief-prefill-org-race (all merged to main)
- Session duration: long (multi-slice, brainstorm→spec→plan→subagent-implement→verify per slice)

### Recent Commits (for context)
  - ee3334e4 fix(dragonshare): capture restaurant id so brief→org match survives URL cleanup (#63)
  - a6422a4b feat: caption field + brief caption pre-fill (Phase B Slice 3) (#62)
  - 19110c96 feat: brief → DragonShare 'Make it & submit' CTA + brief→submission link (Phase B Slice 2) (#61)
  - 844585e0 Merge pull request #60 (Phase B Slice 1 — content-brief recommender)
  - (Phase A keystone shipped earlier: #59 content-performance-capture)

## Handoff Chain

- **Continues from**: prior Content Engine work — Phase A keystone (`content-performance-capture`, PR #59,
  live) and the self-improving-app vision in `docs/wiki/concepts/self-improving-app.md`.
- **Supersedes**: None.

## Current State Summary

The DragonCandy "Content Engine" (self-improving-app) **Phase B is fully shipped and verified in prod**
across three slices. A content creator can now: pick a restaurant on their dashboard → Donny returns a
structured **content brief** (Slice 1, `content_briefs`) → tap **"Make it & submit"** which deep-links into
DragonShare with the restaurant pre-selected and the brief→submission link recorded (Slice 2,
`dragonshare_posts.source_brief_id`) → the **caption field arrives pre-filled and editable** from the brief's
`sample_caption` + hashtags (Slice 3, `dragonshare_posts.caption`). End-to-end proven by a real prod row
(`79d42758`, Uncle Rocco) carrying both `source_brief_id` and the edited caption. A late bug (PR #63) was
found during verification and fixed — see Potential Gotchas. **Next session: the deferred "performance half"
of the loop** (Phase C below). Everything is merged; local main + worktree + origin/main all at `ee3334e4`.

## Codebase Understanding

### Architecture Overview

- **The loop's two halves.** Phase B built the *forward* half: signals → brief → action (submission). The
  *return* half (engagement back to the brief) is **not built**. The reserved column
  `content_briefs.social_post_log_id` (nullable) exists for it but is never populated.
- **Identity chain (critical, reused everywhere):** `RestaurantTypeahead` / `search_restaurants` /
  `get_restaurant_by_org_id` all return `organizations.id` (NOT `business_profiles.id`). The org→restaurant
  resolution is two queries (no FK to embed): `org_members` (org_id + invitation_status='active') →
  `business_profiles` (account_type='restaurant', joined by user_id). `content_briefs.organization_id` =
  `dragonshare_posts.target_org_id` = that `organizations.id`. `business_contexts.profile_id` = owner user_id.
- **Edge function deploy:** functions importing `_shared/*` must deploy via Supabase CLI run FROM the worktree
  (`supabase functions deploy <name> --project-ref <ref>`); MCP `deploy_edge_function` does NOT bundle
  transitive `_shared` deps. `content-strategy-recommend` (Slice 1) imports `_shared` + `supabase/functions/donny-orchestrator/rag.ts`.
- **Lovable** deploys frontend from `origin/main` on merge (~10–15 min). Migrations + edge functions deploy
  separately. No migration was needed for Slices 2 or 3 (columns already existed).

### Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `supabase/functions/content-strategy-recommend/{index.ts,brief.ts}` | Slice 1 edge fn: org→restaurant resolve, RAG, Sonnet, persist brief. `ContentBrief` shape has `sample_caption`, `hashtags`, `hook`, `angles`, etc. | Brief generation; `brief.ts` is pure + tested |
| `supabase/migrations/20260611120000_content_briefs.sql` | `content_briefs` table (creator_id, organization_id, brief jsonb, **social_post_log_id nullable ← Phase C target**, used_performance_data) | Phase C populates social_post_log_id |
| `src/pages/CreatorDragonShare.tsx` | `usePreselectedOrg` (deep-link `?restaurant=&brief=`), threads `preselectedOrg`/`sourceBriefId`/`prefillCaption` to both forms | Where the race fix landed |
| `src/hooks/useDragonShareSubmitForm.ts` | Submit form state: caption, draft persistence, seed-once, `handleSubmit` | Caption + source_brief_id flow through here |
| `src/hooks/useDragonShare.ts` | `useSubmitDragonSharePost` — the `dragonshare_posts` insert (caption, source_brief_id) | The single write moment |
| `src/lib/composeCaption.ts` (+ test) | Pure helper joining caption + hashtags | Slice 3 |
| `supabase/migrations/20260610140000_content_performance.sql` | Phase A `content_performance` table (per-post metrics, captured by Vault-cron) | Phase C reads/links to this |
| `docs/wiki/concepts/self-improving-app.md` | The loop + phased roadmap | Source of truth for the vision |

### Key Patterns Discovered

- **subagent-driven-development** workflow held up well: fresh subagent per task (haiku for mechanical, sonnet
  for judgment), controller verifies spec-compliance inline, build (`npm run build` + tsc strict) is the gate,
  frequent commits, adversarial spec/plan/code reviewers catch grounding errors before implementation.
- **Capture deep-link URL params at mount.** See Gotchas — this is now a saved project memory.
- **Verify the DB, not just the UI.** A surviving UI pre-fill masked a dead data link for two slices.

## Work Completed

### Tasks Finished

- [x] Phase B Slice 1 — content-brief recommender (PR #60, live; validated with real "Uncle Rocco" brief)
- [x] Phase B Slice 2 — "Make it & submit" CTA + `source_brief_id` (PR #61, live)
- [x] Phase B Slice 3 — caption field + brief caption pre-fill (PR #62, live)
- [x] Race-condition fix repairing both caption pre-fill AND source_brief_id (PR #63, live)
- [x] Prod verification: row `79d42758` carries both `source_brief_id` and the edited caption
- [x] Local main checkout refreshed to `ee3334e4` (0 behind origin/main)
- [x] Saved project memory: `project_deeplink_param_query_race.md`

### Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `src/lib/composeCaption.ts` (+test) | New pure helper | Slice 3 |
| `src/hooks/useDragonShare.ts` | `caption?: string \| null` arg widen | Slice 3 (insert already had caption from Slice 2) |
| `src/hooks/useDragonShareSubmitForm.ts` | caption state, draft persistence, seed-once-from-prefill (draft wins), reset, submit | Slice 3 |
| `src/pages/CreatorDragonShare.tsx` | `prefillCaption` derivation; **capture restaurant id (race fix)** | Slice 3 + PR #63 |
| `src/components/dragonshare/{DragonShareInlineForm,DragonShareSubmitSheet}.tsx` | caption `<textarea>` + `prefillCaption` prop | Slice 3 |

### Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Caption field always-on optional | only-from-brief; collapsible | One consistent form; the field is the natural home for the captured caption |
| Caption transport = refetch, not URL param | URL param | Captions are long/multi-line; the brief row is already fetched to validate the link |
| Hashtags ride in the caption text | separate hashtags column/chips | No schema change; minimal slice |
| Restored draft wins over brief prefill | prefill always wins | Don't clobber a creator's typed-then-navigated caption (seededRef init from draft) |

## Pending Work

## Immediate Next Steps

**(Phase C — the performance half of the loop.)**

1. **Brainstorm + spec Phase C** (use the brainstorming skill): how a published DragonShare post's engagement
   flows back to the brief. Core question: what correlation key bridges `dragonshare_posts` → `social_post_log`
   → `content_performance`, and when is it written?
2. **Likely shape:** add a correlation column (e.g. `social_post_log.dragonshare_post_id`) wired into the
   Outstand-publish path, so when a boosted post is actually published, its `social_post_log` row links back to
   the `dragonshare_posts` row (which already has `source_brief_id`). Then a step populates
   `content_briefs.social_post_log_id`, closing brief → submission → published post → measured engagement.
3. **Depends on a real boost + publish happening** (DragonShare boost → Outstand cross-post). Confirm that path
   currently produces a `social_post_log` row and on what trigger before designing the link.
4. Once linked, `content_performance` (Phase A, captured daily by Vault-cron) gives per-post engagement keyed to
   the brief — enabling "which briefs produced content that actually performed" and feeding the data flywheel.

### Blockers/Open Questions

- [ ] Does the current DragonShare boost→Outstand publish path write a `social_post_log` row, and with what
      identifiers? (Inspect `social_post_log` schema + the publish edge function / hooks before designing.)
- [ ] Is `content_performance` keyed by `social_post_log_id`, by platform post id, or both? Reconcile with the
      Phase A capture payload (Outstand `aggregated_metrics`).

### Deferred Items

- Restaurant-side / aggregate brief analytics surfaces (e.g. "briefs acted on" dashboards).
- Caption: per-platform variants, AI "rewrite this caption" in the submit form, structured hashtag chips.

## Context for Resuming Agent

## Important Context

**Phase B is DONE and verified — do not redo it.** The next work is **Phase C: the return half of the loop**
(engagement → brief). The reserved hook is `content_briefs.social_post_log_id` (nullable, currently always
null). The forward chain already records `dragonshare_posts.source_brief_id`, so Phase C is about linking a
*published* post's `social_post_log` row to that `dragonshare_posts` row, then to the brief, then reading
`content_performance` (already captured daily). Start with brainstorming — the publish path's actual data shape
is the unknown that gates the design.

### Assumptions Made

- The creator demoing owns the briefs (creator_id `7dfe511e…`); RLS read-own on `content_briefs` is correct.
- `get_restaurant_by_org_id` returns `organizations.id` == its input arg (verified from the function def).

### Potential Gotchas

- **Deep-link param query race (now fixed, but instructive — saved as memory
  `project_deeplink_param_query_race.md`):** a URL-cleanup `useEffect` that strips `?restaurant=&brief=` after
  `org` resolved was tearing down the org query (keyed on the LIVE param) before the sibling brief query
  resolved, so the brief→org match never held → caption never seeded AND `source_brief_id` was never recorded
  (silently, for 2 slices). Fix: capture deep-link params at mount; key queries on the captured value. **For
  any new deep-link flow feeding multiple async queries, capture the params at mount.**
- **Verify the DB recorded the link, not just that the UI looks right** — the UI pre-fill survived while the
  data link was dead.
- **Worktree discipline:** work ONLY in `.claude/worktrees/autoresearch`; never edit the main checkout. Refresh
  local main with `git -C C:/GIT/... merge --ff-only origin/main` after every merge.
- **Edge fns importing `_shared` deploy via CLI from the worktree, not MCP.**

### Environment State

- **Supabase prod ref:** `zocahiffooqdybdhguqv`. **Staging ref:** `mhffqrawgizhprbobcta`.
- **MCP:** `execute_sql`, `get_advisors`, `deploy_edge_function`, `list_edge_functions` available.
- No active processes/servers. No secrets in this doc.
- Relevant env var NAMES only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY` (edge-fn side); `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend).

## Related Resources

- Specs: `docs/superpowers/specs/2026-06-10-creator-content-brief-recommender-design.md` (S1),
  `2026-06-11-brief-to-dragonshare-cta-design.md` (S2), `2026-06-11-caption-prefill-design.md` (S3).
- Plans: `docs/superpowers/plans/2026-06-11-brief-to-dragonshare-cta.md`,
  `docs/superpowers/plans/2026-06-11-caption-prefill.md`.
- Vision: `docs/wiki/concepts/self-improving-app.md`.
- Phase A: `supabase/migrations/20260610140000_content_performance.sql`,
  `supabase/functions/content-performance-capture/`.
- Verification row: `dragonshare_posts.id = 79d42758-e7f6-46b0-84e0-633c0f6e3e0a` (prod).

---

**Security Reminder**: Before finalizing, run `validate_handoff.py` to check for accidental secret exposure.
