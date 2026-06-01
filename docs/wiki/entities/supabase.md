---
title: Supabase
type: entity
created: 2026-05-23
updated: 2026-05-24
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
- 70+ tables, 71 Deno edge functions, shared utils in `_shared/`
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

## Known Issues

- RLS infinite recursion in some policies (active workstream)
- Nested profile joins blocked by RLS (removed)

## See Also

- [[DragonCandy Platform]]
- [[TypeScript Patterns]]
- [[Error Handling Patterns]]
- [[Code Architecture Audit Session]]
- [[Realtime Edge Cases Session]]
- [[Counter-Offer Enum Fix Session]]
- [[Campaign Delivery, Scheduling & Notifications Session]]
- [[DragonShare Amplification Engine Session]]
