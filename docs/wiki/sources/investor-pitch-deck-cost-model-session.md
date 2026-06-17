---
title: Investor Pitch Deck & Cost Model Session
type: source
created: 2026-06-17
updated: 2026-06-17
sources: [2026-06-17-investor-pitch-deck-cost-model.md]
tags: [fundraising, pitch-deck, cost-model, donny, brands, vision]
---
# Investor Pitch Deck & Cost Model Session

Session that built DragonCandy's first investor-facing fundraising artifacts: an in-repo pitch
deck at the unlisted `/pitch` route and a sourced capital-raise cost model. Shipped on branch
`worktree-DC-pitch-deck` across three commits; PR #111 opened against `main` (not merged at
session end). Codex second review run twice, both clean. See [[Investor Pitch Deck & Capital Raise]]
for the durable concept.

## Key claims

- **Deck:** self-contained brand-faithful HTML/React, 15 slides, `noindex`, no app chrome (one
  early return in `AppLayout`). Lives in `src/pitch/`. Exported to a 15-page 16:9 PDF via
  `npm run pitch:pdf` (build → vite preview → Playwright image-per-page). Brand rules enforced:
  `dc-*` tokens, Outfit/Pacifico, **no dragon emoji, no gray**.
- **The ask:** ~$3M seed ($2.5–3.5M, ~$12–15M post-money, **50/30/20** = Engineering&Donny /
  GTM&metros / working capital) over an 18-month runway.
- **Cost model** (`docs/DragonCandy_Capital_Raise_Cost_Model.md`) reconciles infra (100→1M users),
  hybrid NYC-loaded staffing, phased Donny super-agent R&D, mobile (Apple+Google), brand
  acquisition, and a sequenced 3-metro launch (Hoboken→Manhattan→Palm Beach). Every figure cites a
  repo doc or a 2026 external benchmark.
- **Brands** are the high-LTV third side (CAC $1.5–3.5K, LTV $24–72K, LTV:CAC ~7–20:1), acquired
  founder + AE led with **no new hire**; ~$30–50K GTM absorbed → raise band unchanged. Brand role
  still behind `BRAND_ROLE_ENABLED`.
- **Vision slide:** Donny's trajectory to an AGI-adjacent super-agent, and DragonCandy's
  model-agnostic, provider-independent adaptability ("we ride every model").

## Notable quotes

> "We don't bet on one model — we ride every model. Adaptability is the moat that compounds."
> (Vision slide closing line)

> "A raise funds the team you can't yet self-fund" — framing that reconciles the requested roster
> with the lean staffing plan; lean rules become gates on the spend.

## See Also

- [[Investor Pitch Deck & Capital Raise]]
- [[Pricing Architecture]] · [[Take-Rate Ladder]] · [[Data Flywheel]]
- [[Donny AI]] · [[North Star & KPI Scorecard]] · [[Payments Split by Surface]]
- [[Self-Improving App]] · [[Musk's Algorithm]]
