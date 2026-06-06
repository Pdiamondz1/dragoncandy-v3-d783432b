---
title: QA CI/CD Gate
type: concept
created: 2026-06-02
updated: 2026-06-02
sources: [docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md, raw/sessions/2026-06-02-205607-qa-staging-supabase-planb.md]
tags: [ci-cd, staging, testing, deployment]
---

# QA CI/CD Gate

An automated quality gate plus a tested staging environment between code and
production. Today `main` **is** production — Lovable auto-deploys `main` to
dragoncandy.io with no gate — so this initiative inserts verification before
anything can reach `main`. A human still clicks "merge" (a deliberate **ship
gate**), honoring [[Musk's Algorithm]]'s "automate last; never automate a broken
process."

## End-State Pipeline

```
PR to main → CI gate (install · build · typecheck · lint · unit tests)
  → Vercel auto-deploys the PR to a preview URL (STAGING Supabase env)
  → CI runs a curated Playwright e2e smoke suite against that preview
  → branch protection requires all checks green
  → human reviews + clicks Merge        ← ship gate
  → main → Lovable auto-deploys to dragoncandy.io (prod)
```

## Three Plans

- **Plan A — CI quality gate** (shipped): `.github/workflows/ci.yml`, Vitest
  e2e-exclude cleanup, branch-protection runbook. No new infra.
- **Plan B — Staging environment** (this session): a separate, isolated staging
  [[Supabase]] project (migrations + functions + secrets), Vercel per-PR previews,
  env wiring, CSP parity. See [[QA Staging Supabase (Plan B) Session]].
- **Plan C — e2e on staging** (next): parametrize Playwright `baseURL`, triage the
  suite (move `debug-*` specs to a non-gating folder), add the e2e CI job, update branch protection.

## Key Decisions

- **Human ship gate retained** — checks + staging run automatically; a human merges.
- **Separate staging Supabase project**, not Supabase branching (paid) — full data isolation.
- **Lovable stays the prod host** — Vercel only serves previews; do NOT attach dragoncandy.io to Vercel.
- **Staging AI-spend guard** decided before wiring keys: a dedicated $25/mo Anthropic workspace (hard cap).

## Known Issues / Caveats

- Staging schema is stood up by replaying migrations — which exposed [[Migration Replay Drift]].
- Edge functions must be deployed to staging explicitly (Lovable only ships frontend).

## See Also

- [[QA Staging Supabase (Plan B) Session]]
- [[Migration Replay Drift]]
- [[Supabase]]
- [[Musk's Algorithm]]
