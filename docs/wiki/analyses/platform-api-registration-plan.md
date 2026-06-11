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
| **YouTube (Google)** | console.cloud.google.com | `yt-analytics.readonly` + Data API v3 | OAuth app verification (restricted scope) | Weeks | ☐ Not started | — |
| **TikTok** | developers.tiktok.com | insights/stats scopes | Per‑scope review; often TikTok Business acct | Variable | ☐ Not started | — |
| **X (Twitter)** | developer.x.com | v2 metrics endpoints | **Paid tier** (Basic/Pro) | Days + $ | ☐ Not started | — |
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

## Other platforms — known requirements (verify on portal before filing)

- **YouTube (Google):** Google Cloud project → enable **YouTube Data API v3** + **YouTube Analytics
  API**. Analytics needs the **`yt-analytics.readonly`** scope, which is **sensitive/restricted** →
  production use requires **Google OAuth app verification** (possibly a security assessment). Quota‑unit
  limits apply. *(Joe's `@josephcastelo149` and our test YT posts live here — the `mJuDd` per‑post
  empty came from this account.)*
- **TikTok:** developers.tiktok.com → register an app; apply for **insights/stats scopes**. Many TikTok
  APIs are **allowlisted/selective**; insights often require a **TikTok Business account**. Per‑scope
  review.
- **X (Twitter):** developer.x.com → v2. Engagement/metrics endpoints generally require a **paid tier**
  (Basic/Pro) — the Free tier won't return them. Quick to set up once you choose a plan.
- **Toast:** apply to the **Toast partner/developer program** (approval‑gated), then **per‑restaurant
  OAuth**. Feeds a *different* signal class — restaurant **revenue/traffic** — into the restaurant‑facing
  recommender via the same source‑agnostic pattern (a Toast adapter → a metrics store the recommender
  reads). PROJECT_CONTEXT already flags a **6–12 month** timeline; consistent with the prod state (zero
  `toast_*` tables, `toast-oauth-start` 503s, dead refresh cron — see [[Content Engine Data Audit]]).

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

- Meta for Developers — Instagram Platform: Overview, Insights, App Review, Instagram‑Login docs
  (developers.facebook.com/docs/instagram-platform), reviewed 2026‑06‑11.
- Codebase audit (`content-performance-capture`, `outstand-proxy`, `useAccountMetrics`,
  `social_analytics_cache`) + prod row scan 2026‑06‑11.
