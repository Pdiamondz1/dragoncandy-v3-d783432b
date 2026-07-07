-- AIOS spend source-of-truth (Slice B): the alert loop.
--
-- Refine the existing `ai-cost-vs-cap` Founder Playbook so a scheduled run through
-- `playbook-runner-agent` files a REPORT-ONLY breach finding. The runner keys on a
-- per-check verdict in {green, watch, breach, not-yet-measurable} (breach->critical,
-- watch->medium finding; all-clear posts nothing). The prior prompt asked for an
-- "over/under verdict" — not that vocabulary — so the runner had nothing to gate on.
--
-- Two disciplines baked in: (1) RUNTIME SCOPE — the cap governs donny_cost_ledger
-- (the app's AI serving cost), NOT the founder's Claude Code dev spend (opex); and
-- (2) explicit 80%/100%-of-cap thresholds. Non-destructive: UPDATEs the seed row's
-- prompt fields only (report-only; allowed_proposals stays empty).
update public.aios_playbooks set
  task_md = $md$Report whether platform RUNTIME AI spend is within the cost cap, and emit a verdict the runner can gate on.

1. Pull month-to-date RUNTIME AI spend with get_cost_stats — the sum of donny_cost_ledger.estimated_cost_usd for the current calendar month (all tiers, including the OpenAI `embedding` tier). This is the app's serving cost: Donny/Dezzy generation + RAG embeddings.
2. Pull month-to-date revenue with get_revenue_stats (convert cents to dollars).
3. Compute the cap = the GREATER of the $250/mo pre-revenue FLOOR and 15% of MTD revenue. Confirm the basis against PROJECT_CONTEXT §8 (Pricing) via get_internal_doc.
4. Report: MTD runtime AI spend, MTD revenue, the applicable cap (state whether it is the floor or 15%-of-revenue), and remaining headroom (cap − spend).
5. Assign ONE verdict for the cap check: `breach` if spend > cap; `watch` if spend ≥ 80% of cap; `green` if below 80%; `not-yet-measurable` ONLY if get_cost_stats returns no data at all. Call out a breach or watch first.$md$,
  done_criteria_md = $md$MTD runtime AI spend, MTD revenue, the applicable cap (floor vs 15%-of-revenue), and remaining headroom are all reported, and the cap check carries exactly one verdict — green / watch / breach / not-yet-measurable — against the 80%-of-cap (watch) and 100%-of-cap (breach) thresholds.$md$,
  preferences_md = $md$SCOPE — RUNTIME ONLY. The cap governs the app's AI serving cost, which is EXACTLY donny_cost_ledger. It does NOT include founder Claude Code / development AI usage — that is opex, tracked separately in operating_expenses. NEVER compare the ledger against the ~$225/mo total Anthropic+OpenAI invoice, or you will report a false breach; the ledger is the only correct basis.

Thresholds: watch at ≥ 80% of the cap, breach above 100%. Pre-revenue the applicable cap is the $250/mo floor (15% of ~$0 revenue is below the floor). Convert cents to dollars; never invent a number a tool did not return. Be terse: short labeled bullets, not tables.$md$,
  updated_at = now()
where slug = 'ai-cost-vs-cap';
