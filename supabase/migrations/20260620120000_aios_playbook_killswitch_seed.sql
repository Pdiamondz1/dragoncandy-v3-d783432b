-- Seed the report-only "Kill-switch guardrail watch" Founder Playbook (A1).
-- Mirrors 20260619150000_aios_playbooks_seed.sql. Idempotent on slug.
-- Report-only (allowed_proposals = []): it evaluates the four PROJECT_CONTEXT §3
-- kill-switches and reports each green / watch / breach / not-yet-measurable.
-- Pre-revenue it is an armed-watch scaffold — churn / CAC-payback / LTV:CAC have
-- no data source yet (no cohort/subscription/marketing-spend tables).

insert into public.aios_playbooks (slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals)
values
  (
    'kill-switch-watch',
    'Kill-switch guardrail watch',
    'Evaluate every kill-switch from the strategy library and report whether any is tripped. Find the canonical thresholds with get_internal_doc (PROJECT_CONTEXT §3 "Kill-switches" and the north-star KPI scorecard). The four kill-switches are: (1) churn > 6% MONTHLY, (2) CAC payback > 12 months, (3) LTV:CAC < 2:1, (4) revenue-per-employee floor ($400K), which is a Y2-Y3 maturity gate, NOT a Y1 trigger. Pull the live data you can with get_platform_stats, get_revenue_stats, and get_cost_stats. For EACH kill-switch report its current value (or status), its threshold, and a verdict: green / watch / breach / not-yet-measurable. Call out any breach first.',
    'Honor the §3 scoping notes verbatim: churn is measured per MONTH (>6%/mo is worse than the 3-5%/mo SMB benchmark); do NOT treat revenue-per-employee as a breach in Y1 — report it as "gate inactive (Y2-Y3 maturity gate)". Use aggregate dollars only and convert cents to dollars; never invent a number a tool did not return. Churn, CAC-payback, and LTV:CAC have NO data source today (no cohort, subscription, or marketing-spend tables) — report each as "not yet measurable — armed; needs cohort/CAC instrumentation", never as green or breach. Be terse: short labeled bullets, not tables.',
    'All four kill-switches are listed, each with a current value or explicit status, its threshold, and a green/watch/breach/not-yet-measurable verdict; any breach is called out first; no kill-switch is silently omitted.',
    '[]'::jsonb
  )
on conflict (slug) do nothing;
