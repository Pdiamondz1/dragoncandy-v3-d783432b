---
title: Content Engine Phase D Session
type: source
created: 2026-06-11
updated: 2026-06-11
sources: [raw/sessions/2026-06-11-142417-content-engine-phase-d.md]
tags: [content-engine, donny, dragonshare, content-briefs, performance, rls, creator-dashboard]
---

# Content Engine Phase D Session

## Summary

The 2026-06-11 session that built and shipped **[[Content Engine]] Phase D** — the first creator-facing
surface on the loop Phase C closed server-side. It adds a **"Your content briefs"** card to the creator
dashboard: a persistent history of the briefs a creator generated (briefs were generate-and-forget
before) that lights up with real engagement as it flows. The single piece of backing infrastructure is
a SECURITY DEFINER RPC, `get_creator_brief_performance`, that bridges the cross-user RLS gap. Delivered
through the full brainstorm → spec(review) → plan(review) → subagent-driven implementation →
staging-probe → gated prod-promotion → verify discipline. Feature PR #77 + docs PR #78, both merged and
verified live on prod (commit `7206c09a`).

## Key Claims

- **The cross-user RLS gap is the heart of Phase D.** Phase C writes `content_performance.user_id` = the
  *publisher* (often the restaurant who clicked "Post Now"), and the table is owner-only — so a creator
  cannot read their own brief's performance through it. The fix is an **ownership-gated definer RPC**
  scoped on `content_briefs.creator_id = auth.uid()`: the table policy stays owner-only (writes
  unforgeable), and the `creator_id` join is the *sole* authorization (cannot leak another creator's
  briefs or a restaurant's unrelated posts). Generalized in project memory `cross-user-read-definer-rpc`.
- **Milestoned snapshots must be reduced-then-summed.** `content_performance` keeps up to 3 rows per
  post (24h/72h/7d, `unique(outstand_post_id, milestone)`). The RPC takes the most-mature snapshot per
  post first (`distinct on (outstand_post_id)` + a milestone-rank `CASE`, not lexical) before summing
  across sibling posts — verified by a staging probe asserting `2 posts / 435 views` (not 735).
- **A new RPC needs a surgical `types.ts` add.** The generated `Functions` type is an explicit
  whitelist, so `supabase.rpc('get_creator_brief_performance')` is a strict-typecheck error until the
  one Args/Returns entry is added (mirroring `resolve_dragonshare_orgs`) — not a full regen.
- **Lean by design.** Scope was deliberately limited to history + lifecycle status (no detail page,
  charts, or edge-fn change), because `content_performance` is empty in prod (no paying boosts yet). The
  card's present value is *persistence*; metrics appear automatically when data flows, no rebuild.
- **Verified the authenticated path headlessly.** Signed in as the creator test account via Supabase
  auth REST and called the RPC with that JWT — it returned the creator's 4 briefs under live RLS, all
  "Not posted yet" — a stronger confirmation than a screenshot of an empty card.

## Notable Gotchas (for future sessions)

- Lovable/Vite bundle hashes can contain `-` (e.g. `index-B4B-vbk9.js`); a `[A-Za-z0-9_]+` scan regex
  silently misses the entry — use `[A-Za-z0-9_-]+`.
- Vercel skips redeploy on merge-from-base commits, so the `deployment_status`→`smoke` CI chain never
  fires and the PR stays BLOCKED; push an empty commit to force a fresh preview deploy. Required checks
  are only `verify` + `smoke`; repo disallows auto-merge.

## See Also

- [[Content Engine]] — the loop + all four phases (D = creator read surface)
- [[Self-Improving App]] — Phase 6 (Content Engine); now closed and surfaced to creators
- [[DragonShare]] — the submission/publish path the engagement flows through
- [[Content Engine Data Audit]] — why the card is empty in prod today
- [[Content Engine Phase B Session]] — the prior build session
