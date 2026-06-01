# Session Extract: DragonShare Amplification Engine (shipped, web)

**Created**: 2026-06-01
**Branch**: worktree-wiki (synthesis of work landed 2026-04-27 → 2026-06-01)
**Project**: C:\GIT\dragoncandy-v3-d783432b

## Summary

DragonShare went from spec to a fully shipped (web) amplification engine. Creators
upload organic content about restaurants; restaurants/brands boost it to cross-post
across their connected social channels via Outstand, paying the creator through
Stripe Connect with an 80/20 creator/platform split. This extract synthesizes the
buildout across multiple sessions and specs (2026-04-27 design, 2026-05-10 social
integration, 2026-05-27 desktop polish, 2026-05-29 Stripe restaurant payments,
2026-06-01 flow fixes, 2026-06-01 video-frame thumbnails).

## What Shipped

- **Upload-first submit flow** — single screen, media upload is first-class; optional
  post link with URL-to-platform auto-detection (Instagram/TikTok/YouTube/X/Other);
  restaurant typeahead + full browse page; success confirmation dialog with "Share another".
- **Trust-then-flag model** — posts default to `verified`. No admin queue, no pre-publish
  verification, no Donny scoring gate. Safety is post-hoc via a flag/report mechanism
  (`flagged_at`/`flagged_by`).
- **Watermarked content preview** — CSS overlay ("DragonCandy • PREVIEW") shown before
  payment; clean download only after boost/payment.
- **Custom boost amount** — preset tiers plus a custom input ($5–$500).
- **Boost-or-pass decision** — restaurants/brands either Boost (pay) or Pass (soft decline).
  Pass sets `declined_at`/`declined_by`, removes the post from the queue, never deletes it.
- **Real photo/video-frame thumbnails** across all four surfaces (creator card, boosting
  card, desktop upload preview, mobile upload sheet) via an `isVideoPost` helper and a
  native `<video src="#t=0.5">` poster-frame approach.
- **Desktop side-by-side layout** (form left, history right) at `lg+`; mobile keeps the
  bottom sheet. Restaurant browse page with cuisine/search filters and query-param pre-fill.
- **Two-path Stripe payment** — first boost goes through hosted checkout (saves card, sets
  default); subsequent boosts are one-tap off-session charges to the saved default card.
- **Idempotent fulfillment** + 80/20 payout to the creator on success.

## Key Decisions & Why

- **Removed the admin queue and Donny scoring in favor of trust-then-flag.** MVPs over-gate;
  organic creator content rarely needs pre-approval. Faster go-live and better creator UX,
  with post-hoc flagging as the safety valve. (2026-04-27)
- **`post_url` and `platform` made nullable.** Direct uploads need no link; platform is
  inferred or null. Reduces submit friction. (2026-04-27)
- **`content_file_path` stored as a public URL** (public `dragonshare-content` bucket), used
  directly as `<img>/<video>` src — no signing round-trip.
- **Security-definer RPCs (`resolve_dragonshare_orgs`, `get_org_connected_platforms`)** so a
  creator can see the restaurant name they're targeting and a restaurant can see its own
  connected social accounts — both otherwise blocked by RLS on `organizations`. (2026-06-01)
- **Two-path charge with hosted-checkout fallback.** First boost = hosted checkout (save +
  set default PM via `setup_future_usage: off_session`); repeat boosts = off-session charge.
  If an off-session charge throws `authentication_required` / `requires_action` (3DS), fall
  back to hosted checkout. (2026-05-29)
- **Idempotent `fulfillBoost` shared helper** with transfer keys (`boost_tr_${boostId}`),
  called by both the off-session success path and the webhook, so there is exactly one
  fulfillment code path and no double payouts on webhook retries. (2026-05-29)
- **Decline is one-way per row; re-submit creates a new row.** Soft-decline preserves the
  audit trail and keeps the queue filter trivial (`declined_at IS NULL`). (2026-06-01)

## Bugs / Gotchas Discovered

- **`content_file_path` must NOT be wrapped in `useSignedUrl`.** It is already a public URL;
  `createSignedUrl` expects a storage key, so re-signing silently fails and media never
  renders. (This is also recorded in project memory.) (2026-06-01 thumbnails)
- **RLS on `organizations` blocks creator reads of restaurant names** — the creator isn't a
  member of the target org, so the embedded join returns null. Use the security-definer RPC.
- **`business_outstand_accounts` is keyed to `business_profiles.id`, not `organizations.id`** —
  resolving an org's connected platforms requires org → owner user → business_profile → accounts.
- **Mobile sheet reset on incidental closes** — Radix `Sheet` `onOpenChange` reset the form on
  keyboard open / focus shift, wiping the upload. Only reset on explicit cancel or successful submit.
- **Cross-origin download** had to be forced for the post-payment clean download.

## Patterns Worth Preserving

- Upload-first form: lead with media, collect metadata after.
- Typeahead + browse-fallback converging via query params.
- Security-definer RPCs as the clean way to read across RLS boundaries.
- Off-session payment with hosted-checkout fallback for one-tap repeat purchases.
- Idempotency keys on Stripe transfers as cheap insurance against webhook double-fires.
- Soft-decline (additive) over hard delete to preserve analytics/audit.

## Tables Touched

`dragonshare_posts` (nullable url/platform, `content_file_path`, `flagged_*`, `declined_*`,
default `verified`, removed scoring/admin-queue fields), `dragonshare_boosts`,
`dragonshare_payouts`, `dragonshare_events`, plus `organizations.stripe_customer_id` reuse and
`push_notifications` boost/decline types.

## Key Files

`src/components/dragonshare/*` (DragonShareInlineForm, DragonShareSubmitSheet,
DragonSharePostCard, BoostConfirmationSheet, AmplificationPreview, WatermarkedMedia,
RestaurantTypeahead, RestaurantCard, RestaurantBrowseHeader), `src/hooks/useDragonShare*`,
`src/lib/dragonshareOrgs.ts`, `src/lib/dragonsharePostState.ts`,
`src/components/dragonshare/boostOutcome.ts`, `src/pages/{Creator,Business}DragonShare.tsx`,
`src/pages/DragonShareBrowseRestaurants.tsx`, and the boost-payment / fulfill-boost edge
functions.
