---
title: AIOS White-Label Extraction
type: analysis
created: 2026-06-18
updated: 2026-06-18
sources: [2026-06-18-harbormill-aios-extraction.md]
tags: [aios, architecture, white-label, generalization, ingest-seam, multi-tenant]
---
# AIOS White-Label Extraction

Extracting DragonCandy's `/internal` AIOS into the standalone **Harbormill AIOS** template
(see [[Harbormill AIOS Template Extraction Session]]) was an unintentional architecture audit:
it forced a clean line between AIOS code that is **domain-agnostic** and code that was
**welded to the marketplace**. This page records that line, because it is the most reusable
output for DragonCandy's own AIOS.

## What generalized cleanly

- **The four-pillar shape** — shell + tiered auth, AI assistant + RAG, operating deck
  (metrics/briefs/findings), Google Workspace bridge — ported with only renaming.
- **Tiered access** — the `app_role` enum (admin, stakeholder) + `has_role`/`is_admin`/
  `has_access` SECURITY DEFINER functions + provisioned-only auth (no public signup) are pure
  infrastructure; nothing marketplace-specific.
- **The Google Workspace bridge** — the proxy pattern (HMAC-signed OAuth state, `drive.file`
  scope, tokens never leaving the backend, a `*_connection_status()` RPC as the only
  client-visible surface) is product-neutral. Ported from [[Google Workspace]] by changing one
  folder-name string.
- **The assistant engine** — Anthropic agentic loop + pgvector RAG + `match_knowledge` +
  OpenAI embeddings is generic once the tools are pluggable.

## What was marketplace-coupled (and how it was decoupled)

- **The stats layer was the hard part.** DragonCandy's `/internal` overview is hardcoded SQL
  RPCs over marketplace tables (campaigns, payouts, DragonShare). That does not generalize at
  all. **Decoupling move:** invert it into a single service-role ingest seam (`report-ingest`)
  writing generic `metric_snapshots` rows, and have the deck read only the latest snapshot per
  key. The dashboard never touches business tables; each tenant runs its own agent to push
  KPIs in. This is the keystone that made the whole template possible — and a candidate pattern
  for decoupling DragonCandy's own deck from its query layer.
- **The assistant's 21 tools** were marketplace verbs (create campaign, match creator, …).
  **Decoupling move:** a tool *registry* with a generic starter set; clients append their own.
- **Fallback prod credentials** in `integrations/supabase/client.ts` are a DragonCandy-only
  convenience that is actively wrong for a multi-tenant template. **Decoupling move:** env-only
  client, no fallbacks, `.env.example` only.

## Key Decisions

- **Configure, don't fork.** Rebrand surface is confined to `brand.ts` + CSS variables +
  logo; everything else reads from config. Per-client clones take base updates via an
  `upstream` remote rather than diverging.
- **Multi-tenant = deploy-time isolation.** No shared backend; each client is a full clone
  wired to its own Supabase/keys. Data ownership is the selling point.
- **The ingest seam is the altitude.** Keeping the deck domain-agnostic behind one
  service-role choke point is what generalizes — the same instinct as DragonCandy's
  `aios-report-ingest` choke point, taken one step further.

## Known Issues

- Live backend verification needs real infra (Supabase project + AI/Google keys) — a local
  build alone can't prove migrations, RLS, pgvector, or OAuth. The session used a throwaway
  $10/mo demo project to close this gap.
- Cross-platform lockfiles break strict `npm ci` (esbuild optional packages) → use
  `npm install` in CI.

## See Also

- [[Harbormill AIOS Template Extraction Session]] — the session that produced this
- [[Google Workspace]] — the bridge pillar, ported near-verbatim
- [[Donny AI]] — the assistant whose tool layer was genericized
- [[Self-Improving App]] — the RAG + knowledge-sync lineage
- [[Musk's Algorithm]] — delete-then-generalize is the extraction in miniature
