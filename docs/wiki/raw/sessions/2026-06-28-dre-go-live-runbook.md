# Session — DRE Go-Live Runbook & Readiness Check

- **Date:** 2026-06-28
- **Branch:** `docs/dre-go-live-runbook` (worktree `DC-Dezzy-AI-2`)
- **Context:** Prepared while finishing the Dezzy suite — Dezzy's Domain-6 amplification core is gated on the
  DRE going live, so a read-only readiness check + go-live runbook was produced for the founder's launch
  decision. **No prod change made** (read-only probe + a docs runbook).

## What this is

A go-live runbook + readiness check for the Dragon Rewards Engine, added as a section to
`docs/wiki/concepts/dragon-rewards-engine.md`. Investigation findings (read-only prod probe + engine-code
read):

- **The DRE is fully deployed and running, not "pending deploy".** `dre-award-engine` is deployed (v1,
  ACTIVE) and cron jobid 7 fires every 5 min.
- **The silent backfill already ran:** `dragon_point_events` = 98 rows, `dragon_point_balances` = 24 users
  with computed points/tiers, `dre_pending_events()` = 0. (Both tables were 0 earlier the same day — the
  cron processed the backlog in between.)
- **`go_live_at = 2099-01-01` gates ONLY the in-app bell, not awarding and not UI visibility.** The engine
  inserts awards unconditionally; `go_live_at` is used at one line to suppress notifications for events
  older than it ("silent backfill"). Points/tiers/badges are already computed.
- **Readiness flag:** the consumer UI (`DragonPointsCard` on creator/business dashboards, `DragonTierBadge`
  on public profiles, via `useDragonPoints`/`usePublicDragonTier`) renders from the balances/tier view with
  **no `go_live_at` or feature-flag gate in `src/`** — so the ~24 backfilled users likely already see their
  Dragon Points + tier badge. Consistent with the documented v1 design (tier-badge display shipped;
  go_live = bells only), but worth founder/DRE-team confirmation that the silent soft-launch of the display
  is intended (the UI has no gate if they wanted it hidden until announcement).

## Key point for the founder

"Go-live" is **not** an engineering deploy and **not** "start awarding" (already happening silently) and
**not** "reveal the program" (UI already visible). Flipping `go_live_at` to a real cutover **only turns on
forward-going award notifications**; it is **effectively irreversible** (can't un-notify / un-award / un-show).
So it is a founder business launch decision. The runbook documents the pre-flight check, the admin-gated
`dre_config` flip, verification, and the (limited) rollback.

## Affected files / artifacts

- `docs/wiki/concepts/dragon-rewards-engine.md` — added "Go-Live Runbook & Readiness Check (2026-06-28)".
- **No** code / schema / config / prod change — read-only investigation + docs only.
