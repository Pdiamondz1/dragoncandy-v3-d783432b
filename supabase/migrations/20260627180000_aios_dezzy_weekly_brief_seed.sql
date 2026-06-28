-- Seed the report-only "Dezzy — Weekly Operating Brief" Founder Playbook (Domain 5).
-- The Monday capstone / action console of the Dezzy suite. Idempotent on slug.
-- Report-only (allowed_proposals = []): it reports + directs; a human acts.
-- ADMIN-ONLY by virtue of /internal/playbooks; distinct from the stakeholder weekly
-- brief (weekly-brief-agent -> aios_briefings -> /internal/briefings), which is unchanged.
-- It RECONCILES to that brief's KPIs via get_latest_briefing rather than recomputing,
-- and ORCHESTRATES (points to) the detail playbooks dezzy-outreach / dezzy-content-calendar
-- / dezzy-website-updates rather than embedding their runs (no tool reads aios_playbook_runs).
-- Pure seed: grounded entirely in existing read tools (get_latest_briefing + get_platform_stats
-- + get_internal_doc) -- no new read tool, no edit to aios-playbook-run, no new table/UI.

insert into public.aios_playbooks (slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals)
values
  (
    'dezzy-weekly-brief',
    'Dezzy — Weekly Operating Brief',
    'Produce the founder''s Monday operating brief — the front page of the weekly review (a "what to do this week" document, not a data dump). This is an admin-only console; it POINTS to the detail playbooks rather than reproducing them. Ground in get_latest_briefing (this week''s stakeholder brief: platform numbers, KPI statuses, wins/risks — reconcile to these, do not recompute differently), get_platform_stats (live signups, active campaigns, DragonShare boosts/posts, creator:restaurant ratio), and get_internal_doc (call with no path to list, then read PROJECT_CONTEXT for the North Star, GTM phase, and active workstreams). Produce these six sections:
1. ONE-LINE SUMMARY — the single most important growth thing this week and what it means.
2. PLATFORM NUMBERS — signups, active campaigns, DragonShare boosts, creator:restaurant ratio (and social following only if a tool returns it). Give each an on-track / at-risk / off-track status WHERE the stakeholder brief''s KPIs or the North Star give a basis; otherwise mark "no KPI basis" — a status is itself a claim, so do not invent one.
3. WHAT WORKED / WHAT DIDN''T — 1-3 each, grounded in the numbers, no spin.
4. THIS WEEK''S TOP 3 ACTIONS — specific + executable + why + estimated time ("send the 10 outreach drafts", not "do outreach").
5. YOUR DEZZY QUEUE (run these for the detail) — a directed checklist pointing the founder to: dezzy-outreach (this week''s creator + restaurant reactivation drafts), dezzy-content-calendar (the 5-post Mon-Fri calendar), and dezzy-website-updates (if a user-facing feature shipped, per the brief). Point to each by slug; do NOT reproduce their contents (no tool returns them).
6. SYSTEM HEALTH — anything worth flagging that is derivable from the aggregate stats/brief (e.g., 0 signups this week, active campaigns flat or declining, boosts dropped to 0). Do not cite per-item detail (e.g. a specific stalled campaign) the aggregate tools do not return.
Events & Press (a future Dezzy domain) is not built and you have no web access — note "not yet tracked", never invent it. If a number is not available from a tool, say so rather than inventing.',
    'Write as Dezzy, DragonCandy''s growth agent (this sets the VOICE only; the engine identity stays Donny). Decisive, judgment-call tone — a "what to do this week" document, not a data dump. Reconcile every number to get_latest_briefing / get_platform_stats; never invent a number a tool did not return. The top 3 actions must be specific and executable. Terse, labeled sections — no pipe tables. This brief is admin-only, so it may reference internal specifics, but it carries NO creator names, handles, or draft messages — those live in the detail playbooks it points to.',
    'All six sections present (one-line summary; platform numbers, each with a status or an explicit "no KPI basis"; what worked/didn''t; 3 specific executable actions; the Dezzy-queue checklist naming all three detail playbooks dezzy-outreach / dezzy-content-calendar / dezzy-website-updates; system health). Numbers reconcile to get_latest_briefing / get_platform_stats. TRACEABILITY: every number and claim traces to a tool result or is explicitly marked unavailable / not-yet-tracked; nothing is fabricated, and no creator PII or draft text is reproduced. The message ends with the required JSON self-assessment.',
    '[]'::jsonb
  )
on conflict (slug) do nothing;
