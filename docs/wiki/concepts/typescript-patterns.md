---
title: TypeScript Patterns
type: concept
created: 2026-05-23
updated: 2026-05-24
sources: [.claude/handoffs/2026-05-04-232158-code-architecture-audit-remediation.md]
tags: [typescript, strict-mode, patterns]
---

# TypeScript Patterns

TypeScript conventions and patterns established during the code
architecture audit remediation.

## Strict Mode

TypeScript strict mode is enabled (`tsconfig.app.json`). This includes
`noUnusedLocals`, `noUnusedParameters`, and `noImplicitOverride`.
`exactOptionalPropertyTypes` is deferred.

## Type Safety Patterns

- Supabase query results: use `Database['public']['Tables']['x']['Row']`
  from generated types — never `any`
- Error handling: `catch (e: unknown)` with `e instanceof Error` narrowing
  — never `catch (e: any)`
- Null safety: prefer nullish coalescing (`?? 0`, `?? ''`) over type
  assertions
- React events: use `React.ChangeEvent<HTMLInputElement>` etc.

## Export Conventions

- Named exports for all components
- Default exports only for pages
- shadcn/ui components (`src/components/ui/**`) exempted

## See Also

- [[Supabase]]
- [[Error Handling Patterns]]
- [[DragonCandy Platform]]
- [[Code Architecture Audit Session]]
