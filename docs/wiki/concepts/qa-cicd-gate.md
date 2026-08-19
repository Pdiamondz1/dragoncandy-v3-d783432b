---
title: QA CI/CD Gate
type: concept
created: 2026-06-02
updated: 2026-08-19
sources: [docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md, raw/sessions/2026-06-02-205607-qa-staging-supabase-planb.md, raw/sessions/2026-06-07-core-docs-recent-updates-sync.md, raw/sessions/2026-07-19-staging-headless-login.md, raw/sessions/2026-08-19-tech-department-scope-and-repo-joinability.md]
tags: [ci-cd, staging, testing, deployment]
---

# QA CI/CD Gate

An automated quality gate plus a tested staging environment between code and
production. `main` **is** production — merging auto-deploys `main` to
dragoncandy.com with no further gate — so this initiative inserts verification before
anything can reach `main`. A human still clicks "merge" (a deliberate **ship
gate**), honoring [[Musk's Algorithm]]'s "automate last; never automate a broken
process."

> **Corrected 2026-08-19.** This paragraph and the pipeline below said *"Lovable
> auto-deploys"* until today, even though the Decisions section had recorded the Vercel
> cutover on 2026-07-16 — **a correction filed in one place while the present-tense claim
> survived in two others.** The same drift was live in
> `docs/runbooks/qa-staging-gate.md` and `feature-change-workflow.md`, both fixed in the
> same pass. When superseding a claim, grep the page (and its runbooks) for every
> restatement of it; recording the supersession once is not the same as applying it.

## End-State Pipeline

```
local dev (STAGING Supabase — a guard blocks prod; see below)
  → PR to main → CI gate (install · build · typecheck · edge typecheck · lint · unit tests)
  → Vercel auto-deploys the PR to a preview URL (STAGING Supabase env)
  → CI runs a curated Playwright e2e smoke suite against that preview
  → branch protection requires `verify` + `smoke` green
  → human reviews + clicks Merge        ← ship gate
  → main → Vercel auto-deploys to dragoncandy.com (prod)
```

**The local stage was added to this diagram on 2026-08-19, and it was not a documentation
gap — it was a missing boundary.** Until then `npm run dev` connected to the *production*
database, so the leftmost stage of this pipeline had no isolation at all while every stage
to its right did. See [[Local/Production Boundary & Repo Joinability]].

## Three Plans

- **Plan A — CI quality gate** (shipped): `.github/workflows/ci.yml`, Vitest
  e2e-exclude cleanup, branch-protection runbook. No new infra.
- **Plan B — Staging environment** (this session): a separate, isolated staging
  [[Supabase]] project (migrations + functions + secrets), Vercel per-PR previews,
  env wiring, CSP parity. See [[QA Staging Supabase (Plan B) Session]].
- **Plan C — e2e on staging** (shipped): a curated Playwright e2e smoke gate now runs
  against staging previews, with auth + smoke hardened to be robust against a
  freshly-seeded staging DB. An end-to-end QA staging/CI-CD gate **runbook** was added,
  plus a preview-url helper + feature-change workflow doc. The Plan B env-wiring fix
  (`VITE_SUPABASE_URL`) was carried to the `VerifyEmail` catch-branch fallback. All three
  plans (A/B/C) are now in place.

## Headless login — verifying auth-gated screens without a person (2026-07-19)

Signing in by hand made the founder a bottleneck on every UI check, and an agent
cannot type a password into a login form at all. `npm run staging:login --
<role> --base <preview>` routes around both: it mints a browser-ready session for
a seeded staging test account **with no password typed anywhere** (admin
`generate_link` → JSON `/auth/v1/verify` exchange → session in the URL hash,
persisted by `detectSessionInUrl`). The JSON verify path deliberately avoids
Supabase's Redirect-URL allow-list, which cannot cover per-branch preview hosts.
Guards refuse prod (JWT-`ref` decode, not substring), require the target frontend
to be on staging (checks both `VITE_SUPABASE_URL` **and**
`VITE_SUPABASE_ANON_KEY` under Vite's real env precedence), and **pin the target
to this project's own previews** so tokens can't leak into a foreign preview's URL
fragment. The three seeded accounts (`restaurant`/`creator`/`brand`
`.staging@dragoncandy.test`) are the **entire** staging user table — a founder's
own `@harbormill.net` account exists only in *production*, which is why real
credentials never work against a preview. See [[Staging Headless Login Session]].

## Key Decisions

- **Human ship gate retained** — checks + staging run automatically; a human merges.
- **Separate staging Supabase project**, not Supabase branching (paid) — full data isolation.
- ~~**Lovable stays the prod host**~~ — **superseded 2026-07-16:** prod cut over to
  Vercel (`dragoncandy.com` now serves from Vercel; Lovable is only an AI-edit surface;
  see `docs/runbooks/vercel-prod-cutover.md`). The gate still uses Vercel **Preview**
  scope for staging.
- **Staging AI-spend guard** decided before wiring keys: a dedicated $25/mo Anthropic workspace (hard cap).

## Known Issues / Caveats

- Staging schema is stood up by replaying migrations — which exposed [[Migration Replay Drift]].
- Edge functions must be deployed to staging explicitly (the host only ships the frontend).
- **The green `smoke` gate can be false assurance (2026-07-19).** Staging drifted
  ~6 weeks / ~90 migrations behind prod, and its recorded `schema_migrations`
  disagrees with its actual objects (missing tables that predate its own cutoff).
  Because `smoke` only signs in and navigates, it passes while the DB cannot run
  current code. **Do not read a green smoke as "prod-like verified."** A
  campaign-critical subset (the 28-migration Crews cluster) was replayed to
  unblock the dashboard/list surfaces, but full parity is a separate effort — and
  **MCP `apply_migration` does not record `schema_migrations`**, so replayed
  migrations need their history rows inserted by hand. **Prefer verifying an
  auth-gated feature on prod after merge** (schema current), using
  `npm run staging:login` only for surfaces that don't hit the drifted bits.

## See Also

- [[Staging Headless Login Session]]
- [[QA Staging Supabase (Plan B) Session]]
- [[Local/Production Boundary & Repo Joinability]]
- [[Migration Replay Drift]]
- [[Supabase]]
- [[Musk's Algorithm]]
- [[Core Docs Recent Updates Sync Session]]
