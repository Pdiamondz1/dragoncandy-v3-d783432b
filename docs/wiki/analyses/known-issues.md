---
title: Known Issues
type: analysis
created: 2026-06-01
updated: 2026-06-01
sources: [.claude/handoffs/2026-05-21-160000-counter-offer-enum-fix.md]
tags: [bugs, known-issues, enum, postgres]
---

# Known Issues

Verified-but-unfixed issues, tracked so discoveries aren't lost. Documentation
only — entries here have no committed fix.

## campaign_status enum missing `in_progress`

**Status:** open · verified 2026-06-01 · first flagged 2026-05-21

The `campaign_status` enum is defined once
(`supabase/migrations/20250616011059_*.sql`) as:

```
('draft', 'published', 'active', 'completed', 'cancelled')
```

No later migration adds an `ALTER TYPE ... ADD VALUE 'in_progress'`, yet
application code references an `in_progress` campaign state in several places.
Postgres rejects implicit enum casts on variables (only string literals get the
cast), so any path that assigns `'in_progress'` to a `campaign_status` column or
variable risks a runtime cast error.

Surfaced during the counter-offer enum fix
([[Counter-Offer Enum Fix Session]]), which fixed a related PL/pgSQL variable
typing bug (`v_app_status text` → `application_status`) but left the
`campaign_status` gap unaddressed.

**Resolution options (not yet chosen):**
- Add `in_progress` to the enum via `ALTER TYPE` migration, or
- Remove `in_progress` references and standardize on `active`.

Either path is a code change and out of scope for the documentation refresh
that created this page.

## See Also

- [[Counter-Offer Enum Fix Session]]
- [[Campaign Lifecycle]]
- [[Supabase]]
