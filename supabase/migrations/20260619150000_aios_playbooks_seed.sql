-- Seed 3 report-only Founder Playbooks that exercise the runner's available read
-- tools (get_platform_stats / get_revenue_stats / get_cost_stats /
-- get_platform_weight_trend / get_latest_briefing / get_internal_doc). All ship
-- report-only (allowed_proposals = []); proposals can be enabled per-playbook
-- later. Idempotent on slug.

insert into public.aios_playbooks (slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals)
values
  (
    'weekly-kpi-variance',
    'Weekly KPI variance check',
    'Pull this week''s live platform stats (get_platform_stats) and the latest weekly brief (get_latest_briefing). Find the north-star KPI scorecard in the strategy library (get_internal_doc — call with no path to list docs, then read the scorecard). For each tracked KPI, report the current value, its target, and an on-track / at-risk / off-track verdict. Call out the biggest variances.',
    'Be terse and analytical — short labeled bullets, not tables. Aggregate revenue is fine to cite; never invent a number a tool did not return. Convert cents to dollars.',
    'Every KPI in the scorecard is listed with its current value (or "no data"), its target, and an on-track/at-risk/off-track verdict, and the largest one or two variances are called out explicitly.',
    '[]'::jsonb
  ),
  (
    'scaling-capacity-check',
    'Scaling & capacity check',
    'Read the last 30 daily platform-weight snapshots (get_platform_weight_trend). Find the scaling thresholds / compute-tier guidance in the strategy library (get_internal_doc). Report current DB and storage size, the 7- and 30-day growth rate, and whether any scaling threshold is being approached.',
    'Terse. Cite actual byte figures converted to MB/GB. Flag bad news plainly. Recommend a tier action only if a threshold is genuinely near.',
    'Current DB and storage size are reported, growth over 7 and 30 days is computed, and there is a clear verdict on whether any scaling threshold is near (with a recommendation only if so).',
    '[]'::jsonb
  ),
  (
    'ai-cost-vs-cap',
    'AI cost vs 15% cap',
    'Pull month-to-date AI spend (get_cost_stats) and aggregate revenue (get_revenue_stats). The AI-spend cap is 15% of revenue with a ~$250/mo floor pre-revenue — confirm the exact basis against the pricing doc (get_internal_doc). Report MTD AI spend by tier, current revenue, the applicable cap, and remaining headroom.',
    'Convert cents to dollars. Be precise about whether the cap basis is 15%-of-revenue or the floor. Terse.',
    'MTD AI spend, current revenue, the applicable cap (15%-of-revenue or the floor), and remaining headroom are all reported, with an explicit over/under-cap verdict.',
    '[]'::jsonb
  )
on conflict (slug) do nothing;
