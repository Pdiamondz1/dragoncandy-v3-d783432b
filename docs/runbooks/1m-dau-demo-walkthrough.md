# "DragonCandy at 1M DAU" — standup demo walkthrough (reshaped)

> **Why this shape.** The original plan was a walkable *isolated* copy of the app seeded to look at-scale.
> That mechanism is blocked: Supabase branches on this project are `MIGRATIONS_FAILED` (the 342-migration
> history doesn't rebuild a clean DB from scratch — verified 2026-07-28 on a fresh probe branch), and the
> logged-in dashboards would need net-new earnings/payout seeders + a password-login path. So this demo
> instead uses **surfaces that are already live on prod** + a **shareable briefing artifact**. No new
> backend, nothing fabricated, everything labelled.

## The three assets

1. **The briefing** — `DragonCandy at 1M DAU — Scale & Cost Model` (Claude artifact, private).
   The shareable scale + weight + economics story, built from the real forecast model. Open this first
   and/or leave it on screen; it is the spine of the demo.
2. **The live app on prod** — the consumer feed and marketplace are already populated with segregated
   **synthetic** data (excluded from all real metrics). Good for the "it's a real, alive product" beat.
3. **The internal deck on prod** — `/internal/forecast`, `/internal/weight`, `/internal/simulation`
   already show the 1M economics, the live infra weight, and the captured load-test proof. No DEMO mode
   needed (the Phase-1 `DEMO_SCALE` overlay from PR #356 is for a future isolated instance and stays off
   on prod by design).

## Audience-facing narrative (say this)

> "We modeled exactly what the app costs and how it performs at a million daily users. Then we
> load-tested the real platform to prove the model's assumptions. Here's the app today, here's the
> model, and here's the measurement that backs it."

Keep the honesty rail out loud: **today is measured, the 1M figures are modeled, and 'gross margin' is
infra-level (excludes payroll/support/processing) — not a full P&L, and not a claim about *when* we
reach 1M.**

## Pre-flight (≈5 min before)

- [ ] Open the **briefing artifact** in a tab (share it beforehand if the audience wants a link).
- [ ] Sign into prod `/internal` as an **admin/founder** (Operate tier is admin-gated).
- [ ] Sanity-check the live product surfaces are populated: creator/business browse + DragonFeed show
      synthetic profiles/posts. (These are the seeded `botmk_*` marketplace cohort + DragonFeed seed.)
- [ ] On `/internal/simulation`, confirm the **Matrix run (summed)** card shows the captured run. If it's
      empty, that's fine — the same measured numbers are in the briefing; skip the live-load beat or
      pre-stage a run (below).
- [ ] Decide whether you'll fire a **live** load burst (optional, has friction — see below) or rely on
      the **captured** run as the proof (reliable default).

## The walkthrough (ordered beats)

1. **Open on the thesis — the briefing.** Headline: 40 real users today → what does 1,000,000 DAU look
   like? Scroll the "weight at scale" tiles (4M users, 80K concurrent, 572 GB DB, 7.6 TB storage, 131 TB
   egress/mo, dedicated compute).
2. **Prove it's a real product — the live app.** Switch to prod. Browse the **marketplace** (both sides,
   many cities) and scroll **DragonFeed**. *"This is the real app; these are synthetic accounts kept
   completely separate from our real metrics — which is how we can load-test in production safely."*
3. **The economics — briefing §2–3.** ~$17.88M/mo modeled revenue vs ~$17.7K/mo cost → ~99.9% infra
   margin, ~1.8¢ per DAU. Land the insight: **the cost of scale is egress + AI, not the database** — 96%
   of the bill — so the lever is media strategy (CDN/caching/transcoding).
4. **The live infra — `/internal/weight`.** Show the real current footprint and the scale-up thresholds.
   Point out the connection caveat: the load run measured the DB at ~30% of connections at 4,000
   concurrent — **connections are not the near-term constraint.**
5. **The measured proof — `/internal/simulation`.** Show the **Synthetic Weight Engine**: the captured
   matrix run (~31K requests, 4,000 offered/honest-peak concurrency, 0 breakage, real media egress).
   Tie back to the briefing's "measured" cards. *"We didn't assume it holds up — we measured it."*
6. **(Optional) Live-load moment.** Fire a small run and watch `/internal/weight` + `/internal/simulation`
   move in real time (see below). If skipping, the captured run already carries the point.
7. **Close on margin — back to the briefing.** The ramp table (500K → 1M): unit economics hold flat;
   this is a marketplace whose infra cost is a rounding error against revenue at scale.

## Firing a live load (optional, advanced)

The synthetic load system targets **prod** by design and is gated for safety. It is **not** a one-click
in-room action — budget for the friction or pre-stage it.

- Mechanism: the **`synthetic-load-matrix.yml`** GitHub Actions workflow (self-contained: seeds a bot
  cohort, then fans load across up to 20 runner shards). Full procedure + teardown:
  `docs/runbooks/synthetic-load-tier-ramp.md`.
- Prerequisites: the **`synthetic-weight`** Actions Environment (reviewer approval gate), prod secrets,
  Stripe **test** keys, and the **`SYNTHETIC_BOTS_ENABLED`** feature flag flipped **on** (it is
  fail-closed / default off).
- For a *live* "watch it move" beat, prefer a **small single-runner run** (a `knee-probe-*` label, not a
  full `matrix-*` fan-out) so the dashboards move within the demo without a long multi-shard job.
- **Teardown after:** stop the run, flip `SYNTHETIC_BOTS_ENABLED` back off, and purge the load cohort
  via `purge_synthetic_load_cohort` (never `purge_synthetic_data` — that also removes the live 25-bot
  daily cohort). See the ramp runbook §7.

## What to have ready if asked

- **"Is that real?"** — Today's footprint and the load run are measured; the 1M numbers are modeled from
  the assumptions shown in the briefing's §6, all founder-tunable.
- **"99.9% margin — really?"** — That's *infrastructure* gross margin (revenue − Supabase + AI +
  tooling). It excludes payroll, support, and payment processing. It's the unit economics of the
  platform, not net profit.
- **"What breaks first at scale?"** — Not the DB (measured ~70% idle at the 200K band). Egress cost and
  the need for a dedicated compute plan — both priced in the briefing.

## Provenance

Numbers computed 2026-07-28 from the live `forecast_*` assumptions in `aios_dashboard_settings`
(all at documented defaults) + the latest `platform_weight` snapshot, via the same model as
`/internal/forecast` (`src/lib/internal/forecastModel.ts`). Load-run figures from the runner-matrix
program (see `docs/runbooks/synthetic-load-tier-ramp.md`).
