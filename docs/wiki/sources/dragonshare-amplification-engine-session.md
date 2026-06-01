---
title: DragonShare Amplification Engine Session
type: source
created: 2026-06-01
updated: 2026-06-01
sources: [raw/sessions/2026-06-01-dragonshare-amplification-engine.md]
tags: [dragonshare, payments, stripe, ugc, social]
---

# DragonShare Amplification Engine Session

Synthesis of the DragonShare buildout from spec to shipped web feature (2026-04-27 →
2026-06-01). Creators upload organic restaurant content; restaurants/brands boost it to
cross-post via Outstand, paying the creator on an 80/20 split through [[Stripe Connect]].

## Key Decisions

- Replaced the planned admin verification queue + Donny scoring with the
  [[Trust-Then-Flag Model]] — posts go live immediately, safety is post-hoc.
- Made `post_url`/`platform` nullable so direct uploads need no link.
- Stored `content_file_path` as a public URL used directly as media `src`.
- Built the [[Two-Path Boost Payment]] flow (hosted-checkout first, off-session repeat) with
  an idempotent `fulfillBoost` helper.
- Used security-definer RPCs to read restaurant names and connected accounts across RLS.

## Patterns Discovered

- Upload-first form (media first, metadata after).
- Typeahead + browse-fallback converging via query params.
- Idempotency keys on Stripe transfers as insurance against webhook double-fires.
- Soft-decline (additive) over hard delete to preserve analytics/audit.

## Known Issues

- `content_file_path` must never be wrapped in `useSignedUrl` (it's already a public URL).
- `business_outstand_accounts` keys to `business_profiles.id`, not `organizations.id`.

## See Also

- [[DragonShare]]
- [[Two-Path Boost Payment]]
- [[Trust-Then-Flag Model]]
- [[Stripe Connect]]
- [[Data Flywheel]]
