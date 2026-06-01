---
title: DragonShare
type: entity
created: 2026-06-01
updated: 2026-06-01
sources: [docs/PROJECT_CONTEXT.md, docs/DATABASE_SCHEMA.md]
tags: [dragonshare, amplification, content, stripe, outstand]
---

# DragonShare

The amplification engine. Creators upload organic content about restaurants;
restaurants boost it to cross-post across their connected social channels via
Outstand. A first-tier platform alongside [[Donny AI]] and [[DragonDash]].

## Model

- **Upload-first submit** — creators upload content directly; `post_url` and
  `platform` are nullable for direct uploads, with `content_file_path`
  pointing at the uploaded asset in Storage.
- **Trust-then-flag** — no admin verification gate. Posts default to status
  `verified`; `flagged_at`/`flagged_by` capture reports after the fact.
- **Restaurant browse** — creators browse restaurants via a search RPC that
  bypasses RLS to surface business names, with cuisine pills and a typeahead.
- **Content thumbnails** — real photo and video frames render across four
  surfaces (creator card, boosting card, mobile upload sheet, desktop upload
  preview). `content_file_path` is a public URL — used directly as `img`/
  `video` `src`, never wrapped in a signed-URL helper.
- **Payment** — [[Stripe Connect]] boost flow with an 80/20 creator/platform
  split.

## Database Tables

- `dragonshare_posts` — creator-submitted content posts (nullable
  `post_url`/`platform`, `content_file_path`, `flagged_at`/`flagged_by`,
  default status `verified`)
- `dragonshare_boosts` — restaurant→creator boost payments (Stripe Connect)
- `dragonshare_payouts` — creator payouts from boosts
- `dragonshare_events` — lifecycle events ([[Data Flywheel]] for future AI
  training)
- `dragonshare_engagement` — engagement tracking (schema only, not populated)

## Storage

- `dragonshare-content` — public bucket for uploaded content
- `profile-assets` — public URLs (replaced signed URLs)

## Key Decisions

- Trust-then-flag replaces an admin-verification gate — less friction, faster
  submit, moderation is reactive.
- Public content bucket + public URLs avoid the signed-URL failure mode where
  a public URL passed to a signed-URL helper silently breaks.

## See Also

- [[Donny AI]]
- [[DragonDash]]
- [[Stripe Connect]]
- [[Data Flywheel]]
- [[DragonCandy Platform]]
