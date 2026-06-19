---
title: Supabase
type: entity
created: 2026-05-23
updated: 2026-06-18
sources: [docs/DATABASE_SCHEMA.md, .claude/handoffs/2026-05-04-232158-code-architecture-audit-remediation.md, raw/sessions/2026-06-02-205607-qa-staging-supabase-planb.md, raw/sessions/2026-06-07-core-docs-recent-updates-sync.md, raw/sessions/2026-06-18-aios-ingest-secret-rotation.md]
tags: [supabase, database, auth, rls]
---

# Supabase

Backend infrastructure: Postgres database, Auth, Edge Functions,
Realtime subscriptions, and Storage.

## Key Patterns

- Single client instance at `src/integrations/supabase/client.ts`
- Always use `.select()` with explicit field lists — no `select *`
- All tables have Row Level Security (RLS) — assume it
- Type-safe queries via `Database['public']['Tables']['x']['Row']`
- 70+ tables, 80 Deno edge functions, shared utils in `_shared/`
- Realtime used for `messages`, `user_presence`, and (since the 2026-05 notification
  system) `push_notifications` + campaign tables for dashboard refresh
- Security-definer RPCs are the standard way to read across RLS boundaries — e.g.
  `has_role()` (RBAC via `user_roles`), and `resolve_dragonshare_orgs` /
  `get_org_connected_platforms` for [[DragonShare]]

## Query Conventions (React Query)

- Hook naming: `use<Entity><Action>`
- Query keys: `['entity-or-path', dependentId]`
- Always `enabled: !!dependency` for conditional queries
- Mutations invalidate related queries via `useQueryClient()`

## Auth

- App-level loading guard in `AppLayout`
- 3-hour global inactivity timeout in `AuthenticatedShell`
- Route guards: ProtectedRoute, VerifiedRoute, BusinessRoute, BrandRoute
- Session hint cleanup implemented May 2026

## Staging Environment (QA Gate)

A separate, fully isolated staging project (`dragoncandy-staging`, ref
`mhffqrawgizhprbobcta`) backs the [[QA CI/CD Gate]], distinct from prod
(`zocahiffooqdybdhguqv`). The Supabase MCP can reach both projects, so any write
must pin the staging ref. Standing it up by replaying all 213 migrations surfaced
[[Migration Replay Drift]]. Edge functions + function secrets must be deployed to
staging **explicitly** (Lovable only ships the frontend). Webhook-receiver functions
(`stripe-webhook`, `toast-redemption-webhook`, `toast-oauth-callback`) require
`verify_jwt = false` in `config.toml` or external callers get 401'd.

**Env-wiring caveat:** the Lovable-generated `src/integrations/supabase/client.ts`
hardcoded the prod URL/anon key and ignored `VITE_SUPABASE_URL`, so a staging build
silently talked to prod (other callers already read the env var → split-brain). Fixed
client.ts + 3 hardcoded callers to read `import.meta.env.VITE_SUPABASE_URL` with a prod
fallback. `client.ts` is auto-generated, so re-check after any Lovable regeneration.

## Edge-function auth & API keys

- `verify_jwt = false` functions check the bearer themselves (webhooks, OAuth receivers,
  and service/cron callers). Must be set in `config.toml` **and** at deploy time, or
  external callers (and CORS preflights) get 401'd.
- **Service-role bearer is fragile across key rotation.** A function injects
  `SUPABASE_SERVICE_ROLE_KEY` automatically (always current), but any caller that stores a
  **manual copy** of it (a Claude Code cloud-routine env, a Vault secret, an external
  cron) goes stale the moment the credential changes. Supabase's **new API key system**
  (`sb_secret_…` secret keys / `sb_publishable_…` replacing the legacy `service_role` /
  `anon` JWTs) is exactly such a change — creating a new secret key rotated the AIOS
  routines' credential and silently 401'd them for a week (see
  [[AIOS Ingest-Secret Rotation Session]]).
- **Pattern to survive it:** gate service/cron endpoints on a bearer matching *either* the
  injected service-role key (keeps internal function-to-function calls working) *or* a
  dedicated operator-set shared secret (shared helper `_shared/ingest-auth.ts`,
  `AIOS_INGEST_SECRET`). Set that secret's value to the `sb_secret_…` key so the same
  credential also works as a PostgREST `apikey`/Bearer for direct REST reads. The secret
  name **cannot** start with `SUPABASE_` (reserved for injected vars).
- Deploy edge functions with the CLI (`npx supabase functions deploy <fn>
  --no-verify-jwt`) — it auto-bundles `_shared` from disk (no Docker), avoiding the
  manual-MCP-bundle silent-no-op gotcha. Deploys are separate from the Lovable frontend.
- **Caution:** disabling the legacy `service_role` JWT would break every function's
  injected-key admin client (`createClient(URL, SUPABASE_SERVICE_ROLE_KEY)`) — a separate,
  app-wide migration, not a per-function flip.

## Known Issues

- RLS infinite recursion in some policies (active workstream)
- Nested profile joins blocked by RLS (removed)

## See Also

- [[DragonCandy Platform]]
- [[TypeScript Patterns]]
- [[Error Handling Patterns]]
- [[QA CI/CD Gate]]
- [[Migration Replay Drift]]
- [[QA Staging Supabase (Plan B) Session]]
- [[Code Architecture Audit Session]]
- [[Realtime Edge Cases Session]]
- [[Counter-Offer Enum Fix Session]]
- [[Campaign Delivery, Scheduling & Notifications Session]]
- [[DragonShare Amplification Engine Session]]
- [[Core Docs Recent Updates Sync Session]]
- [[AIOS Ingest-Secret Rotation Session]]
