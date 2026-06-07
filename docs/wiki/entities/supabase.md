---
title: Supabase
type: entity
created: 2026-05-23
updated: 2026-06-07
sources: [docs/DATABASE_SCHEMA.md, .claude/handoffs/2026-05-04-232158-code-architecture-audit-remediation.md, raw/sessions/2026-06-02-205607-qa-staging-supabase-planb.md, raw/sessions/2026-06-07-core-docs-recent-updates-sync.md]
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
- 70+ tables, 73 Deno edge functions, shared utils in `_shared/`
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
