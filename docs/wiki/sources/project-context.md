---
title: Project Context
type: source
created: 2026-05-23
updated: 2026-06-01
sources: [docs/PROJECT_CONTEXT.md]
tags: [strategy, identity, north-star]
---

# Project Context

Single source of truth for DragonCandy's identity, strategy, and operating
instructions. Auto-loaded by Claude Code via CLAUDE.md import.

## Key Claims

- DragonCandy is an AI-powered creator-restaurant marketplace HQ'd in
  Hoboken, NJ, connecting three roles: Restaurant, Creator, Brand
- Co-founders: Damon "Dame" Williams (CPO), Joe Castelo (CRO),
  Juwan Robinson (Advisor)
- North star: "Less typing = more margin" — every primary flow under
  10 keystrokes by Month 6
- Pre-revenue by choice: small organic user base, no paying customers yet,
  lean operating cost, Stripe in test mode
- Codebase: 60 pages, 181 hooks, 71 edge functions (as of 2026-06-01)
- [[Donny AI]] is the intelligence layer; [[DragonDash]] is the profit engine
- Data flywheel is the primary moat — log every brief, match, campaign
- Three-year ARR targets: Y1 $300-600K → Y2 $2-4.5M → Y3 $7-12M
- Kill-switches: churn >6%, CAC payback >12mo, LTV:CAC <2:1, rev/employee <$400K

## Active Workstreams (as of 2026-06-01)

- Stripe escrow payments (two-path boost charge) — see [[Stripe Connect]]
- [[Notification System]] — category × channel preference matrix, realtime feed
- [[Donny AI Cost Architecture]] — cost ledger, monthly budget, tier routing
- [[Multi-Deliverable Scheduling]] — per-deliverable hooks, auto cross-scheduling
- CGC campaigns optimization — camera-first submit, 2-tab dashboard
- [[DragonShare]] shipped — upload-first, trust-then-flag, restaurant browse
- App freshness & timestamp-based inactivity timeout

## Notable Principles

- Musk's Algorithm: Question → Delete → Simplify → Accelerate → Automate
- DragonDash over standalone Donny AI (commoditization risk)
- Setup disguised as action (show value before collecting info)
- Bulk changes break builds — surgical, one-change-at-a-time

## See Also

- [[DragonCandy Platform]]
- [[Donny AI]]
- [[DragonDash]]
- [[DragonShare]]
- [[Take-Rate Ladder]]
- [[Data Flywheel]]
- [[Musk's Algorithm]]
