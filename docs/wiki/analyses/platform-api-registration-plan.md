---
title: Platform API Registration Plan
type: analysis
created: 2026-06-11
updated: 2026-06-11
sources: [codebase-audit, prod-row-scan-2026-06-11, developers.facebook.com/docs/instagram-platform]
tags: [content-engine, analytics, outstand, meta, instagram, tiktok, youtube, x, toast, registration, roadmap]
---

# Platform API Registration Plan

The durable unblock for the [[Content Engine]]'s performance‑learning half. As of 2026‑06‑11 the
signal is **dark in prod**: per‑post Outstand analytics return empty `metrics_by_account`, and
account‑level `social_analytics_cache` is **empty (0 rows)**. [[Outstand]] is a **temporary bridge**;
the plan is **direct platform API access** (Meta IG/FB, X, TikTok, YouTube) plus **Toast**, each of
which requires an external **registration / approval** with weeks‑to‑months lead time. This page is the
running checklist + per‑platform requirements so those applications start now and aren't lost.

> **Goal is the analytics READ signal** (followers, engagement, reach, post insights) — *not* posting.
> Outstand already handles publishing. The registrations matter because they are what eventually make
> the recommender's grounding data real.

## Architecture principle — registrations don't change the app, only the adapter

Every analytics **consumer** reads the source‑agnostic seam (`social_analytics_cache` /
`content_performance`), never a provider API directly. The **source** sits behind an adapter (Outstand
today). When a direct‑platform registration lands, it becomes a **new adapter** that writes the same
cache — the recommender and every other reader stay untouched. So these registrations are a *data‑source
swap*, not an app rebuild. (See [[project_platform_api_registration_strategy]], [[Content Engine]].)

## Status checklist

| Platform | Apply at | Analytics scope(s) needed | Hard prereq | Lead time | Status | Owner |
|---|---|---|---|---|---|---|
| **Meta (IG + FB)** | developers.facebook.com | `instagram_manage_insights` (+ read perms) | Business Verification + App Review (Advanced Access) | 2–4 wks+ | ☐ Not started | — |
| **YouTube (Google)** | console.cloud.google.com | `yt-analytics.readonly` + Data API v3 | Google OAuth verification + **security assessment** (sensitive scope) | **4–6 wks** | ☐ Not started | — |
| **TikTok** | developers.tiktok.com | `user.info.stats` + `video.list` | Per‑scope app review (video demo) | Days–wks (selective) | ☐ Not started | — |
| **X (Twitter)** | developer.x.com | v2 `public_metrics` | **Pay‑per‑use** (no free tier for new devs, Feb 2026) | Days + usage $ | ☐ Not started | — |
| **Toast** | Toast partner program | Orders/Labor/Menu read | Partner‑program approval, then per‑restaurant OAuth | **6–12 mo** | ☐ Not started | — |

**Recommended start order (by lead time, longest first):** Toast partner application → Meta Business
Verification → Google OAuth verification → TikTok → X. The first three are identity/approval‑gated and
will dominate the timeline; start them in parallel immediately.

## Meta (Instagram + Facebook) — deep dive (verified vs. live docs 2026‑06‑11)

The most central platform for the Content Engine (IG is the primary creator surface) and the most
involved registration.

**Two API paths** (pick one; matters for onboarding UX):
- **Instagram API with *Instagram* Login** — users log in with Instagram credentials; endpoints on
  `graph.instagram.com`; **no Facebook Page required**. Simplest for a B2B2C tool where our
  creators/restaurants connect their *own* accounts. **Preferred.**
- **Instagram API with *Facebook* Login** — users log in with Facebook; the IG Professional account must
  be **linked to a Facebook Page** the user admins; endpoints on `graph.facebook.com`. More friction.

**Hard prerequisites (both paths):**
- The connected Instagram account must be **Business or Creator** type — **personal accounts have no API
  access**.
- Account‑level insights via `GET /{ig-user-id}/insights` (impressions, reach, engagement, saves,
  shares); `instagram_manage_insights` also returns audience demographics for the authenticated owner.

**Access levels:**
- **Standard Access** (default) — only accounts you own/manage or that have a role on the app. Fine for
  initial dev/testing against *our own* connected accounts.
- **Advanced Access** — required because DragonCandy serves accounts our **users own (not us)**. This
  triggers **Business Verification** + full **App Review**.

**App Review reality (the long pole):** manual, opaque, **2–4 weeks** (longer for sensitive perms).
Requires: a Business app, **Meta Business Verification** (legal entity), a privacy‑policy URL, app icon,
and **video walkthroughs justifying *each* permission**. Golden rule: **least privilege** — request only
`instagram_manage_insights` (+ minimal read), not a broad set, or risk rejection.

**Action items (Meta):**
1. Create a **Business app** on Meta for Developers; complete **Business Verification** (start now — it's
   the gating step).
2. Choose the **Instagram Login** path; configure Business Login for Instagram.
3. Request **Advanced Access** for `instagram_manage_insights`; prepare the permission‑justification
   video + privacy policy.
4. Build the **Meta adapter** only after approval — it writes `social_analytics_cache` exactly like the
   Outstand adapter, so nothing downstream changes.

## YouTube (Google) — deep dive (verified vs. live docs 2026‑06‑11)

Two APIs in one Google Cloud project: **YouTube Data API v3** (public channel stats — subscribers,
views — readable with an API key, no OAuth) and the **YouTube Analytics API** (detailed creator
metrics, OAuth‑gated).

- **The signal we want** (`yt-analytics.readonly`): per‑creator watch time, engagement, and **audience
  demographics** (age/gender/geo/device) — but **only for the authenticated creator account**, not
  public lookups. So we must OAuth each creator as themselves.
- **The long pole:** because we access analytics for **creators other than the app owner**,
  `yt-analytics.readonly` is a **sensitive scope** → Google **OAuth app verification**, which includes a
  **security assessment**, privacy‑policy review, and a demonstration of legitimate third‑party business
  use. **4–6 weeks**, and Google rejects apps that don't clearly justify why third‑party creator data is
  needed.
- **Token gotcha (matches our cron history):** tokens must be **explicitly refreshed**; silent expiry is
  a common 2026 production failure — mirror the robust Vault‑cron refresh pattern, never the dead‑GUC one
  ([[Content Engine Data Audit]] flags the same risk in `toast-token-refresh`).
- *(Joe's `@josephcastelo149` and our test YT posts live here — the empty per‑post `mJuDd` came from this
  account, so YT is also where we can A/B the direct API vs. Outstand once approved.)*

**Action items:** create a Google Cloud project → enable **YouTube Data API v3** + **YouTube Analytics
API** → configure the OAuth consent screen → request `yt-analytics.readonly` → **submit for OAuth
verification + security assessment** (start early; 4–6 wks).

## TikTok — deep dive (verified vs. live docs 2026‑06‑11)

Free developer account at developers.tiktok.com; the analytics we need maps cleanly to two scopes:

- **`user.info.stats`** → account‑level aggregates: `follower_count`, `following_count`, `likes_count`,
  `video_count` (totals, not time‑series) — **exactly the recommender's account‑level grounding**.
- **`video.list`** → per‑video `like_count`, `comment_count`, `share_count`, `view_count` (the only
  public‑API route to per‑video analytics).
- **Approval:** both scopes require app review — TikTok evaluates purpose/security/data‑use and typically
  wants a **video demo**. Selective but not as identity‑heavy as Meta/Google.
- **2026 note:** a new **Creator Search Insights API** exposes creator‑level data **without per‑creator
  OAuth** — worth evaluating as a lighter‑weight path, though the OAuth `user.info.stats` route is the
  canonical one for *our own users'* connected accounts.

**Action items:** register an app → request `user.info.stats` + `video.list` → prepare the review video
→ submit. (A TikTok Business account on the connected side helps for richer insights.)

## X (Twitter) — deep dive (verified vs. live docs 2026‑06‑11)

**Pricing model changed on 2026‑02‑06:** X replaced tiered plans with **pay‑per‑use as the default for
new developers** — there is **no free tier** and no Basic/Pro signup for new customers.

- **Cost:** ~**$0.005 per post read** (metrics reads), capped at **2M reads/month**; ~$0.01 per post
  created. Legacy **Basic ($200/mo)** and **Pro ($5,000/mo)** exist only for *pre‑existing* subscribers;
  **Enterprise ~$42k/mo**.
- **Signal:** v2 `public_metrics` (likes, reposts, replies, impressions) on a user's posts. Consumption‑
  billed but cheap at our volume; **15‑minute rolling rate‑limit windows** still apply.
- **Lead time:** fast to set up (developer account → project + app → OAuth2) — the gate is cost/usage, not
  a long review. **Lowest priority** of the five (X is a minor channel for our creators).

**Action items:** create an X developer account on pay‑per‑use → project + app → OAuth 2.0 → read
`public_metrics`. Budget the per‑read usage.

## Toast — deep dive (verified vs. live docs 2026‑06‑11)

A different, heavier model — a **formal integration partnership**, not a self‑serve API key. Feeds a
*different* signal class (restaurant **revenue/traffic**) into the restaurant‑facing recommender via the
same source‑agnostic pattern (a Toast adapter → a metrics store the recommender reads).

- **We need the *partner* integration path** (serving many restaurants), not the per‑restaurant custom
  integration.
- **Process:** submit the **Integration Partner Application** (pos.toasttab.com/partners/
  integration-partner-application) + agree to the API Documentation License Agreement → vetting/approval
  from Toast **compliance, privacy, security, legal** → **signed partner agreement** + an assigned Toast
  integrations rep → **sandbox credentials** → build/test → **certification call** → pilot restaurants →
  **general availability** (listed on Toast's public integrations directory). Each restaurant then
  authorizes the connection.
- **Lead time:** longest of all (relationship‑ + legal‑gated) — consistent with PROJECT_CONTEXT's **6–12
  month** flag and the prod state (zero `toast_*` tables, `toast-oauth-start` 503s, dead refresh cron —
  [[Content Engine Data Audit]]). **Start the partner application first** precisely because it's slowest.

**Action items:** submit the Integration Partner Application now (it's a queue, not a build) → progress
through legal/security vetting → sandbox → certification. Treat as a long‑running business‑dev track in
parallel with everything else.

## Interim — verify Outstand's account‑level signal (Step 0)

Before any direct‑API access lands, confirm whether Outstand's **account‑level** endpoint
(`/social-accounts/{id}/metrics`, distinct from the dark per‑post one) returns real data: load the
**Analytics** tab in the Social manager (`/dashboard/{role}/social`, `AnalyticsTab.tsx` →
`useAccountMetrics`) as a user with an active connected account (e.g. `dwilliams@harbormill.net` → IG
"areyouaman"), which fetches Outstand and upserts `social_analytics_cache`; then read the cache. If real
→ the recommender can ground on it in the interim; if dark → wait on the registrations above.

## See Also

- [[Content Engine]] — the loop the signal feeds
- [[Content Engine Data Audit]] — what signal data exists in prod (and what's missing)
- [[Outstand]] — the temporary bridge + its analytics limitations
- [[Self-Improving App]] — Phase 6 (Content Engine)
- [[Data Flywheel]] — why a trustworthy signal matters

## Sources

- **Meta** — developers.facebook.com/docs/instagram-platform (Overview, Insights, App Review,
  Instagram‑Login), reviewed 2026‑06‑11.
- **YouTube/Google** — developers.google.com/youtube (Analytics & Reporting OAuth + Data API v3 auth
  guides), reviewed 2026‑06‑11.
- **TikTok** — developers.tiktok.com (Scopes Overview, `user.info.stats`/`video.list`, Research/Creator
  Search Insights), reviewed 2026‑06‑11.
- **X** — docs.x.com pricing + 2026 pay‑per‑use change (effective 2026‑02‑06), reviewed 2026‑06‑11.
- **Toast** — pos.toasttab.com/partners (Integration Partner Application) + doc.toasttab.com/doc/devguide
  (integration process), reviewed 2026‑06‑11.
- Codebase audit (`content-performance-capture`, `outstand-proxy`, `useAccountMetrics`,
  `social_analytics_cache`) + prod row scan 2026‑06‑11.
