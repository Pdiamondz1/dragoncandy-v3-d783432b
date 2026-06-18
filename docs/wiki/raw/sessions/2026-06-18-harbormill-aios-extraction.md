# Session — Harbormill AIOS white-label extraction + live demo (2026-06-17 → 2026-06-18)

Immutable raw extract. Do not edit.

## What this session did

Built **Harbormill AIOS**, a reusable, sellable white-label "AI operating deck"
template for Harbormill Automation, by extracting and genericizing DragonCandy's
`/internal` AIOS. It lives in a **separate standalone repo** at `C:\GIT\harbormill-aios`
(fresh `git init`, no DragonCandy git history) — NOT a DragonCandy worktree. Pushed to
`https://github.com/Pdiamondz1/harbormill-aios` (origin/main, CI green), marked a GitHub
Template repo. Then stood up a **live Supabase demo** and proved the full stack end to end.

This page is filed in the DragonCandy wiki because the extraction is a real test of the
DragonCandy AIOS architecture: it surfaced which parts of `/internal` generalize cleanly
and which were welded to the marketplace.

## Scope decisions (locked with the user)

- Clean greenfield scaffold, not a fork — port only the four AIOS pillars, genericize, and
  leave all marketplace baggage behind (campaigns, DragonShare, Stripe escrow, Toast,
  Outstand, ~200 unrelated migrations, 60+ unrelated edge functions).
- Full v1 = four pillars: (1) shell + tiered auth + white-label dark theme, (2) AI assistant
  + RAG, (3) operating deck (metrics / weekly briefs / findings), (4) Google Workspace bridge.
- Per-client deploy tenancy — each client gets its own Supabase project, Google Cloud OAuth
  app, and Anthropic/OpenAI keys. They own their data. Setup = clone → fill `.env` → run
  migrations → deploy functions → deploy frontend.
- Default brand "Harbormill AIOS"; clients rebrand via one config file.

## Architecture keystones (what made the extraction work)

1. **One config rebrands everything.** `src/config/brand.ts` (product name, tagline, logos,
   assistant name/persona, role labels) + CSS variables in `src/index.css` (`:root` / `.dark`
   palette). Tailwind tokens renamed `dc-*` → `brand-*` so they resolve from variables.
   Dark-first azure/amber. Rebrand verified with zero component edits.
2. **One service-role ingest seam.** `report-ingest` edge function pushes generic
   `metric_snapshots` / `briefings` / `findings` rows in; the deck NEVER queries business
   tables. This is the single change that let DragonCandy's hardcoded marketplace stat RPCs
   generalize — clients wire their own scheduled agent to publish KPIs. `metric_latest` view
   uses `security_invoker = true` so it enforces base-table RLS as the querying user.
3. **Pluggable AI tool registry** in `assistant-chat/tools.ts` — a small generic tool set
   (search_knowledge, read_metrics, get_latest_briefing, create_finding, export_to_drive,
   list_drive_files) instead of DragonCandy's 21 marketplace tools. Anthropic agentic loop
   (default `claude-sonnet-4-6`), RAG via pgvector + HNSW + `match_knowledge`, OpenAI
   `text-embedding-3-small`.
4. **Per-client secrets, never bundled.** `integrations/supabase/client.ts` is env-only with
   NO fallback prod creds (DragonCandy's client.ts falls back to hardcoded prod creds — the
   template must not). `.env.example` only.

## Build phases (all built + committed, frontend gates green)

Phase 0 scaffold + white-label spine · Phase 1 auth/tiered-access/shell (`app_role` enum =
admin, stakeholder; `has_role`/`is_admin`/`has_access`; no public signup) · Phase 2 operating
deck · Phase 3 AI assistant + RAG · Phase 4 Google Workspace bridge (`google-workspace-proxy`,
HMAC-signed OAuth state, drive.file scope, tokens never leave backend) · Phase 5 docs.

Migrations: `access_roles`, `operating_deck` (metric_snapshots + metric_latest + briefings +
findings + documents), `assistant` (conversations, messages, knowledge pgvector,
match_knowledge, cost_ledger), `workspace` (google_workspace_accounts,
google_connection_status). Edge functions: report-ingest, assistant-chat (+tools.ts),
knowledge-sync, google-workspace-proxy, _shared/.

Demonstrated the upstream→client flow: built a per-vertical reskin on branch
`demo/restaurant-ops` ("Mise" restaurant ops — warm theme + restaurant seed), and clean-merged
a base fix (login tier-article wording) from main into the demo branch.

## Live demo (proven end to end)

Supabase project **harbormill-aios-demo**, ref `khtlrhtgnwhrhrstivkw`, us-east-1, $10/mo.
- Applied all 4 migrations + base SaaS seed (8 KPIs incl MRR $48,200, churn 3.1%, NPS 62; 2
  briefings 1 published; 2 findings; 2 docs).
- Demo admin login `demo@harbormill.net`; created via SQL (auth.users + identity + user_roles
  admin).
- Deployed report-ingest + assistant-chat. With ANTHROPIC_API_KEY + OPENAI_API_KEY set in the
  dashboard, the assistant answered "how are we doing this week?" grounded in the real seeded
  metrics + brief — no hallucination. Full stack proven: auth → RLS → metrics → briefs → AI.
- Showcase path: local `npm run dev` (gitignored `.env` points at the demo project) or host on
  Vercel (added `vercel.json` SPA rewrite for deep-link routing). Vercel deploy was being
  walked through interactively at session end.

## Gotchas captured

- **CI `npm ci` EBADPLATFORM** — a Windows-generated lockfile lists esbuild's foreign-platform
  optional packages in a way that fails strict `npm ci` on the Linux runner. CI uses
  `npm install` instead.
- **GoTrue "Database error querying schema"** on the SQL-created demo user — auth.users token
  string columns were NULL; GoTrue can't scan NULL into them. Fix: `coalesce(...,'')` on
  confirmation_token, recovery_token, email_change*, phone_change*, reauthentication_token.
- **Plain view bypasses RLS** — `metric_latest` ran as owner until set `security_invoker = true`.
- **No MCP/CLI tool to set edge-function secrets** — the user must set them in the Supabase
  dashboard (Edge Functions → Secrets).

## Still pending (for Harbormill, tracked in project memory, not this wiki)

knowledge-sync not yet deployed (RAG over docs); google-workspace-proxy gated on a hosted
frontend (needs `{app-url}/workspace/callback` registered + `GOOGLE_REDIRECT_URI`); frontend
hosting (Vercel) in progress; user must ROTATE the Anthropic/OpenAI/Google secrets shared in
plaintext during setup.

## Source-of-truth pointers

Repo: `C:\GIT\harbormill-aios` · GitHub `Pdiamondz1/harbormill-aios`. Detailed live-infra facts
(project refs, demo login, pending steps) live in DragonCandy project memory
(`project_harbormill_aios_template`, `reference_harbormill_demo`), deliberately NOT in this wiki.
