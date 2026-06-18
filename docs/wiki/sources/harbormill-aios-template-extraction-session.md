---
title: Harbormill AIOS Template Extraction Session
type: source
created: 2026-06-18
updated: 2026-06-18
sources: [2026-06-18-harbormill-aios-extraction.md]
tags: [aios, white-label, harbormill, template, extraction, demo, supabase]
---
# Harbormill AIOS Template Extraction Session

Extracted DragonCandy's `/internal` AIOS into **Harbormill AIOS** — a reusable, sellable
white-label "AI operating deck" template for Harbormill Automation — and stood up a live
demo proving the full stack. The template is a **separate standalone repo**
(`C:\GIT\harbormill-aios`, `Pdiamondz1/harbormill-aios`), not a DragonCandy worktree. Filed
here because the extraction validates which parts of the DragonCandy AIOS generalize.

## Key Decisions

- **Clean greenfield, not a fork.** Port only the four AIOS pillars and genericize; leave all
  marketplace baggage behind (campaigns, [[DragonShare]], [[Stripe Connect]] escrow, Toast,
  [[Outstand]], ~200 unrelated migrations, 60+ edge functions).
- **Per-client deploy tenancy.** Each client = its own [[Supabase]] project + Google Cloud
  OAuth app + Anthropic/OpenAI keys; they own their data.
- **One config rebrands everything** (`brand.ts` + CSS variables); **one service-role ingest
  seam** (`report-ingest`) feeds generic `metric_snapshots`/`briefings`/`findings`; **pluggable
  AI tool registry** trims [[Donny AI]]'s 21 marketplace tools to a generic set. See
  [[AIOS White-Label Extraction]] for the full generalize-vs-coupled breakdown.
- **No bundled secrets** — env-only Supabase client with no fallback prod creds (unlike
  DragonCandy's client.ts).

## Known Issues

- CI uses `npm install` not `npm ci` — a Windows-generated lockfile fails strict `npm ci`
  EBADPLATFORM on esbuild's foreign-platform optional packages on the Linux runner.
- SQL-created demo auth user threw GoTrue "Database error querying schema" until the
  auth.users token columns were `coalesce(...,'')` (NULLs are unscannable).
- A plain Postgres view bypasses RLS — `metric_latest` needed `security_invoker = true`.
- No MCP/CLI tool sets edge-function secrets; they must be set in the Supabase dashboard.
- Demo secrets were shared in plaintext during setup and must be ROTATED.

## See Also

- [[AIOS White-Label Extraction]] — what generalized vs. what was marketplace-coupled
- [[Google Workspace]] — the Connections pillar this template's Workspace bridge was ported from
- [[Donny AI]] — the assistant the template's pluggable tool registry was trimmed from
- [[Self-Improving App]] — the RAG/knowledge pattern the template's knowledge-sync mirrors
