# DragonCandy — Automated Security & Compliance Monitoring

> Ongoing automation that runs without Dame's daily attention. Routes to mobile approval surface (Telegram or GitHub mobile) when human action needed.

---

## Architecture

Two complementary surfaces, neither requires Dame typing:

### Surface A: GitHub Actions (free, runs on schedule)
For static checks that produce auto-PRs or alerts. Best for: dependency audits, security scans, code-level checks.

### Surface B: DragonClaw infra (already built in Phase 0)
For checks that require database access, API calls, or live system inspection. Best for: payment ledger reconciliation, RLS audits, webhook health, runtime monitoring.

---

## Scheduled Job Catalog

Each job listed below has: schedule, what it does, surface, alert path, estimated cost.

### Daily Jobs

#### J-001 — Payment Ledger Reconciliation
- **Schedule:** Every day at 2:00 AM UTC
- **Surface:** DragonClaw scheduled job
- **What it does:** Compares yesterday's `payment_ledger` totals to Stripe Dashboard daily summary. Flags any discrepancy >$1.
- **Alert path:** Telegram DM to Dame if discrepancy found; silent if clean
- **Cost:** ~$0.001/day (one Sonnet call to summarize)
- **Why critical:** Payment integrity is the #1 thing that can't fail silently

#### J-002 — Stale Pending Ledger Rows
- **Schedule:** Every 6 hours
- **Surface:** DragonClaw scheduled job (raw SQL, no LLM needed)
- **What it does:** `SELECT count(*) FROM payment_ledger WHERE state='pending' AND created_at < now() - interval '24 hours'`
- **Alert path:** Telegram DM if count > 0
- **Cost:** $0 (no LLM)

#### J-003 — Webhook Delivery Health
- **Schedule:** Every 4 hours
- **Surface:** DragonClaw scheduled job
- **What it does:** Calls Stripe API to check failed webhook deliveries in the last 24h
- **Alert path:** Telegram DM if any failed deliveries
- **Cost:** $0 (no LLM)

#### J-004 — Failed Auth Spike Detection
- **Schedule:** Every hour
- **Surface:** DragonClaw scheduled job
- **What it does:** Counts failed login attempts in the last hour. If >50 (configurable), alerts.
- **Alert path:** Telegram DM with offending IPs (if logged) and suggestion to enable rate limiting more strictly
- **Cost:** $0

### Weekly Jobs

#### J-005 — `npm audit` + Auto-PR for Safe Patches
- **Schedule:** Monday 9:00 AM UTC
- **Surface:** GitHub Actions
- **What it does:** Runs `pnpm audit`, generates a PR with patch-version updates only (no major/minor jumps without review)
- **Alert path:** GitHub mobile push notification when PR opens
- **Cost:** $0 (GitHub Actions free tier covers easily)

#### J-006 — Supabase RLS Policy Audit
- **Schedule:** Monday 9:30 AM UTC
- **Surface:** DragonClaw scheduled job
- **What it does:** Connects to Supabase as service role, lists all tables, verifies each has RLS enabled. Compares policy list against a baseline file in repo.
- **Alert path:** Telegram DM if any table has RLS disabled OR if policies have changed since last baseline
- **Cost:** ~$0.01/week (one Sonnet call to diff)

#### J-007 — Secret Scanning Sweep
- **Schedule:** Monday 9:45 AM UTC
- **Surface:** GitHub Actions
- **What it does:** Runs `gitleaks` against the entire commit history (incremental — only checks new commits)
- **Alert path:** GitHub Issue + Telegram DM if any secret found (very high priority)
- **Cost:** $0

#### J-008 — Bundle Size & Public-Bundle Secret Sweep
- **Schedule:** Monday 10:00 AM UTC
- **Surface:** GitHub Actions
- **What it does:** Builds production bundle, scans `dist/` for any pattern matching `sk-*`, `eyJ*`, `ghp_*`, `Bearer *`. Flags if found.
- **Alert path:** GitHub Issue + Telegram DM
- **Cost:** $0

#### J-009 — DMCA / FTC Compliance Sweep
- **Schedule:** Monday 10:15 AM UTC
- **Surface:** DragonClaw scheduled job
- **What it does:** Sample 20 random delivered posts from the past week. Verify each has `#ad` or `#sponsored` tag. Alerts if compliance rate <95%.
- **Alert path:** Telegram DM with list of non-compliant posts
- **Cost:** ~$0.05/week (Sonnet calls to inspect post text)

#### J-010 — Stripe Connect Account Health
- **Schedule:** Tuesday 9:00 AM UTC
- **Surface:** DragonClaw scheduled job
- **What it does:** For every connected creator, verify `payouts_enabled`. Flags creators who became disabled (Stripe rejection, missing info, etc.)
- **Alert path:** Telegram DM with list of disabled creators (so Dame can DM them to re-onboard)
- **Cost:** ~$0.001/week

#### J-011 — Idempotency Table Growth Check
- **Schedule:** Wednesday 9:00 AM UTC
- **Surface:** DragonClaw scheduled job (raw SQL)
- **What it does:** Counts `processed_webhook_events` rows. Alerts if growth rate suggests webhook flooding.
- **Alert path:** Telegram DM if anomalous
- **Cost:** $0

#### J-012 — Lighthouse / Performance Regression
- **Schedule:** Wednesday 10:00 AM UTC
- **Surface:** GitHub Actions
- **What it does:** Runs Lighthouse on `/`, `/restaurant`, `/brand`, `/creator` landing pages. Alerts if any score drops >10 points from last week.
- **Alert path:** GitHub Issue + Telegram DM
- **Cost:** $0

#### J-013 — Backup Restore Sanity (every 4 weeks)
- **Schedule:** First Sunday of each month at 3:00 AM UTC
- **Surface:** Manual checklist surfaced by DragonClaw
- **What it does:** Posts a Telegram reminder to manually verify Supabase backup restore works
- **Alert path:** Telegram reminder, Dame ticks off in 10 min
- **Cost:** $0

### Monthly Jobs

#### J-014 — Access Review
- **Schedule:** First Monday of each month
- **Surface:** DragonClaw scheduled job
- **What it does:** Lists all admins/collaborators on GitHub, Supabase, Stripe, Lovable, Anthropic. Asks Dame to confirm each is still authorized.
- **Alert path:** Telegram DM with one-tap confirm/revoke buttons
- **Cost:** ~$0.01/month

#### J-015 — Annual SAQ A Reminder
- **Schedule:** 30 days before annual PCI renewal date
- **Surface:** GitHub Actions cron
- **What it does:** Creates a GitHub Issue tagged `compliance-deadline` with link to Stripe Dashboard
- **Alert path:** GitHub mobile + Telegram DM
- **Cost:** $0

#### J-016 — CCPA Threshold Watch
- **Schedule:** First of each month
- **Surface:** DragonClaw scheduled job
- **What it does:** Counts unique California users in `profiles` table. Alerts at 50K (warning), 75K (act now), 90K (file CCPA registration this quarter).
- **Alert path:** Telegram DM with current count vs threshold
- **Cost:** $0

#### J-017 — Dependency Freshness Report
- **Schedule:** First Monday of each month
- **Surface:** GitHub Actions
- **What it does:** Lists deps that are >12 months behind latest version. Generates a markdown digest as a GitHub Issue.
- **Alert path:** GitHub Issue (no urgent alert)
- **Cost:** $0

### Quarterly Jobs

#### J-018 — Webhook Secret Rotation
- **Schedule:** First Monday of Jan, Apr, Jul, Oct
- **Surface:** DragonClaw scheduled reminder
- **What it does:** Reminds Dame to rotate Stripe webhook signing secret per runbook
- **Alert path:** Telegram DM with link to runbook
- **Cost:** $0

#### J-019 — Penetration Sanity (Self-Test)
- **Schedule:** First Monday of each quarter
- **Surface:** DragonClaw scheduled job
- **What it does:** Runs a battery of self-tests against staging:
  - Try to access another user's data with their JWT
  - Try to submit a payment with a malformed webhook
  - Try to upload to a storage bucket without auth
  - Try to read service-role-only tables with anon key
- **Alert path:** Telegram DM with pass/fail per test
- **Cost:** ~$0.05/quarter

---

## Summary by Surface

### GitHub Actions Jobs (8 total)
J-005, J-007, J-008, J-012, J-015, J-017, plus the build/test pipeline. All free tier.

### DragonClaw Scheduled Jobs (11 total)
J-001, J-002, J-003, J-004, J-006, J-009, J-010, J-011, J-013 (reminder), J-014, J-016, J-018, J-019.

### Total Estimated Monthly Cost
- LLM API costs: **~$0.50–$2.00/month**
- GitHub Actions: **$0** (well within free tier)
- DragonClaw infra (already in budget from earlier docs): **~$25/month** (Railway + Redis + Supabase usage)
- **Combined: under $30/month all-in**

---

## DragonClaw Repurposing — What Changes

The Phase 0 work you already did (`agent_events`, `authorized_users`, `allowlist_rules`, blocklist regexes) stays exactly as-is. The bot worker on Railway stays.

What changes:
- **Remove:** Telegram message handler that triggers Forge (you decided to use Lovable for staff-driven changes)
- **Add:** A scheduler module that reads job definitions from a new `scheduled_jobs` table, dispatches at the right times, calls the appropriate handler
- **Repurpose:** The events table now logs job runs, not staff requests
- **Approval flow:** Where a job needs Dame's tap, post inline keyboard the same way originally planned

---

## New Tables (additions to `dragonclaw` schema)

```sql
-- Job definitions (one row per recurring job)
create table dragonclaw.scheduled_jobs (
  id text primary key,                  -- e.g. 'J-001'
  name text not null,
  description text not null,
  cron_expression text not null,
  handler_module text not null,         -- e.g. 'payment-reconciliation'
  surface text not null check (surface in ('github-actions', 'dragonclaw')),
  is_active boolean not null default true,
  alert_channel text not null check (alert_channel in ('telegram-dm', 'telegram-group', 'github-issue')),
  alert_priority text not null check (alert_priority in ('silent', 'info', 'warn', 'critical')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Job run history (append-only)
create table dragonclaw.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references dragonclaw.scheduled_jobs(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running', 'success', 'warn', 'fail')),
  result_summary text,
  full_output jsonb,
  alerted boolean not null default false,
  created_at timestamptz not null default now()
);

create index on dragonclaw.job_runs (job_id, started_at desc);
create index on dragonclaw.job_runs (status) where status in ('warn', 'fail');
```

---

## Implementation Phasing (post launch)

### Phase 1 (launch week + 2 weeks): Critical only
Ship: J-001, J-002, J-003 (payment integrity)
Time: ~3 days of focused build

### Phase 2 (launch week + 4 weeks): Compliance & audit
Ship: J-005, J-006, J-007, J-008, J-014, J-019
Time: ~3–5 days

### Phase 3 (launch week + 6 weeks): Operational
Ship: J-004, J-009, J-010, J-011, J-012, J-013, J-015, J-016, J-017, J-018
Time: ~3 days

Total time to full automation: **~9–11 days of focused work, spread across 6 weeks**. Done while DragonCandy is live, low-stakes deploys with feature flags per job.

---

## What Dame Does With This System

**Daily:** Glances at Telegram. If no messages from DragonClaw bot, everything is fine. ~30 seconds.

**Weekly:** Reviews any GitHub Issues opened by automated jobs. Approves/rejects auto-PRs from `npm audit`. ~10 minutes.

**Monthly:** Confirms access review (J-014). Reviews CCPA threshold count. ~10 minutes.

**Quarterly:** Rotates webhook secret. Reviews penetration test results. ~30 minutes.

**Total ongoing security/compliance time per month: ~1.5 hours.**

That's the goal. That's the bottleneck removal.
