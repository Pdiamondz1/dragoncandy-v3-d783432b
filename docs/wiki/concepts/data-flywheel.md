---
title: Data Flywheel
type: concept
created: 2026-05-23
updated: 2026-05-23
sources: [docs/PROJECT_CONTEXT.md]
tags: [moat, strategy, data]
---

# Data Flywheel

The primary competitive moat. Log every brief, match, and campaign
completion from Day 1. Network effects and proprietary training data
compound in ways features alone cannot.

## How It Works

More campaigns → better matching data → better [[Donny AI]] recommendations
→ higher creator success rates → more restaurants → more campaigns

## Strategic Implications

- Fine-tuning [[Donny AI]] on proprietary data planned once 1,000-5,000
  campaigns accumulate (LoRA on open-source models)
- Ledger-first architecture ensures all data is captured (payment_events,
  donny_actions, analytics_events, dragonshare_events)
- Defensible because competitors can't replicate accumulated match data
- [[DragonShare]] is an additional flywheel input: every boost logs a
  `dragonshare_events` row, turning creators' organic posting behavior into
  proprietary matching signal (the strategic rationale for shipping it)

## See Also

- [[Donny AI]]
- [[Musk's Algorithm]]
- [[DragonCandy Platform]]
- [[DragonShare]]
