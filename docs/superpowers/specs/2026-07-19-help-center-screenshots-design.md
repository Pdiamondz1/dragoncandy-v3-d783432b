# Help Center Screenshots — Refresh + Extend Design

**Date:** 2026-07-19
**Status:** Approved (brainstorming → spec)
**Author:** Claude (with Dame)

## Problem & Context

The `/help` center renders DB-driven articles (`help_articles.body`, HTML). A follow-up to the
2026-07-17 help-center content refresh: the founder asked to "add screenshots to help page knowledge
base features."

During brainstorming we discovered a **pre-existing, working screenshot system** that was undocumented:

- A Supabase **public storage bucket `help-screenshots`** (`public=true`, no size/mime limit) holding
  **16 PNGs uploaded 2026-05-12**.
- Article bodies embed them as
  `<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/<file>.png" class="rounded-xl shadow-md my-4 max-w-full" alt="…" />`.
- `HelpArticlePage.tsx` sanitizes `body` through DOMPurify and already styles `<img>`
  (`[&_img]:rounded-xl [&_img]:shadow-md [&_img]:my-4 [&_img]:max-w-full`). The renderer needs **no change**.
- CSP `img-src` already allows `https://*.supabase.co`.

So this is **not** "build a mechanism." It is: **refresh the stale May-12 screenshots that are the most
out of date, and add screenshots for the new-feature articles that currently have none.**

### Current bucket inventory (2026-05-12)

Referenced (10 files, 13 articles): `help-restaurant-campaign-detail` (approve-content),
`help-creator-profile` (complete-profile), `help-creator-dashboard` (creator-payment-timing),
`help-dragonshare` (dragonshare-brand), `help-creator-dragonshare` (dragonshare-creator),
`help-messaging` (messaging-basics, messaging-presence), `help-restaurant-billing` (pricing-tiers,
upgrade-downgrade), `help-creator-messaging` (sharing-files-in-chat), `help-landing-page`
(signup-brand/creator/restaurant), `help-restaurant-campaign-create` (what-is-dragondash).

Unreferenced spares (6): `help-center-page`, `help-creator-marketplace`, `help-creator-my-campaigns`,
`help-restaurant-browse-creators`, `help-restaurant-dashboard`, `help-restaurant-settings`.

New-feature articles with **no** screenshot: `launch-campaign`, `apply-campaign`, `creator-crews`,
`creator-crews-creator`, `find-creators-near-me`, `dragon-feed`, `dragon-rewards`, `what-is-donny`,
and the donny_ai set (`donny-help-briefs`, `donny-campaign-suggestions`, `donny-match-scores`).

## Goals

1. Replace the most-stale referenced screenshot with a current capture.
2. Give the highest-value new-feature articles a screenshot, matching the existing embed convention.
3. Change nothing in the frontend renderer or in Donny's backend.

## Non-Goals (YAGNI)

- No new bucket, storage RLS, DB column, or React component.
- No images fed into Donny's grounding — `guidance_agent` strips HTML to plain text, so screenshots
  never reach Donny; Donny's backend is out of scope and untouched. (The `what-is-donny` help article
  in Workstream B is an ordinary help page that *depicts* the Donny panel; that is not "a screenshot
  for Donny" — it is a screenshot on a human-facing help page like any other.)
- Not refreshing every May-12 image this pass — only the one clearly-stale, high-visibility landing shot.
  Other refreshes are a documented follow-up.
- No `/public/help-media/` static approach (rejected — the bucket system already exists).

## Design

### Workstream A — Refresh stale (overwrite the object; no migration)

Overwriting a bucket object updates the image everywhere its `<img src>` already points, so **no DB
change** is needed for a refresh.

- `help-landing-page.png` — referenced by all three sign-up articles; the landing has been fully
  redesigned twice since 2026-05-12, so the May shot is wrong. Public page → capturable with no login.
  This is a **prod overwrite of a live-referenced image** → gated behind an explicit confirm (careful).

### Workstream B — Add new (capture → upload new file → one content migration)

For each new-feature article: capture the current UI, upload as a **new** filename (never overwriting
an existing file), then a single content migration `UPDATE`s the article `body` to insert the `<img>`
near the relevant step. **The migration inserts the `<img>` via a targeted `regexp_replace` on the
first `</p>`** — Postgres's `regexp_replace(source, pattern, replacement)` replaces only the first match
without the `g` flag, so the intro paragraph's closing tag is the anchor and the full body is never
transcribed (zero drift risk). Each `UPDATE` is guarded with `body NOT LIKE '%<file>.png%'` (idempotent
re-run) and bumps `updated_at`; the `search_vector` trigger reindexes automatically. Placement follows
the May convention: the `<img>` lands right after the intro `<p>`, before the first `<ol>`/`<h3>`.
Format matches the existing convention exactly:

```html
<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/<file>.png"
     class="rounded-xl shadow-md my-4 max-w-full" alt="<descriptive alt>" />
```

| Article slug | New file | Role / capture surface |
|---|---|---|
| `launch-campaign` | `help-launch-campaign.png` | restaurant — campaign builder |
| `find-creators-near-me` | `help-find-creators-near-me.png` | restaurant — Find Creators, near-me control |
| `creator-crews` | `help-creator-crews.png` | restaurant — crews |
| `apply-campaign` | `help-apply-campaign.png` | creator — available campaign detail / Apply |
| `dragon-feed` | `help-dragon-feed.png` | creator — Dragon Feed |
| `dragon-rewards` | `help-dragon-rewards.png` | creator — DC Points / Creator standing card |
| `what-is-donny` | `help-what-is-donny.png` | either — Donny panel open |

The migration also bumps `updated_at` on the touched rows (matching the 2026-07-17 pattern). The
`search_vector` trigger (`trg_help_articles_search_vector`, BEFORE INSERT OR UPDATE OF title,body,
search_terms) reindexes automatically on the body `UPDATE`.

### Upload mechanics

`supabase storage cp --experimental <local.png> ss:///help-screenshots/<file>.png` — the CLI is already
authed and linked to prod. New files are additive; the single overwrite (A) is confirmed first.

### Capture method

Live capture via the founder's Chrome on dragoncandy.io. Two logins in sequence (restaurant, then
creator); the landing needs none. Claude drives navigation + screenshot; the founder only signs in.
Framing: desktop viewport, cropped to the feature being documented. Data state = whatever the test
accounts hold (illustrative is sufficient).

## Rendering / Donny (unchanged — stated for completeness)

- `HelpArticlePage.tsx` already sanitizes + styles `<img>`. No change.
- `HelpCenter.tsx` list view strips HTML for its 1-line excerpt (`body.replace(/<[^>]*>/g,'')`), so an
  embedded `<img>` does not disturb the excerpt. No change.
- `donny-orchestrator` `guidance_agent` builds excerpts via `stripHtml(body)` → images never reach
  Donny. No edge-function change; no `edge-function-reviewer` pass needed.

## Error handling / robustness

- Every `<img>` carries descriptive `alt`, so an article stays readable if an image ever 404s.
- Same-origin-to-CSP: `https://*.supabase.co` is already allowed by `img-src`.

## Deploy & verify

1. Capture + upload all Workstream-B files (additive).
2. Confirm + overwrite the Workstream-A landing file (careful gate).
3. Write the content migration; `npm run build`.
4. Codex review of the migration (mandatory second review).
5. Careful-gated `apply_migration` to prod + land the branch (migration + spec/wiki).
6. Verify on prod: load each touched `/help/<slug>` logged-out, confirm the screenshot renders, no
   console errors, both viewports.

## Rollback

- Uploaded files can be re-overwritten or removed (`supabase storage rm`).
- The migration only appends `<img>` to bodies; a follow-up `UPDATE` can strip it. No schema risk.

## Out of scope / follow-ups

- Refreshing the other May-12 authenticated screenshots (dashboards, dragonshare, messaging, billing,
  profile, campaign-create/detail) — a later pass once these land.
- Screenshots for `creator-crews-creator` and the `donny_*` articles — deferred to a second batch.
- Pruning the 6 unreferenced spare images — housekeeping, not now.

## Execution note

Executed **inline this session**, not via subagent-driven-development: the capture half is inherently
interactive (Claude's live browser + the founder's logins) and cannot be delegated to a subagent. The
code half is a single content migration.
