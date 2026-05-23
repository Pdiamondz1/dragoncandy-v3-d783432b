---
title: Supabase
type: entity
created: 2026-05-23
updated: 2026-05-23
sources: [docs/DATABASE_SCHEMA.md, .claude/handoffs/2026-05-04-232158-code-architecture-audit-remediation.md]
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
- 70+ tables, 67 Deno edge functions, shared utils in `_shared/`
- Realtime used for `messages` and `user_presence`

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

## Known Issues

- RLS infinite recursion in some policies (active workstream)
- Nested profile joins blocked by RLS (removed)

## See Also

- [[DragonCandy Platform]]
- [[TypeScript Patterns]]
- [[Error Handling Patterns]]
