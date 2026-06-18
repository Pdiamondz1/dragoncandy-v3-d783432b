# Session: Donny chat pre-fills Create-a-Campaign (2026-06-18)

## What shipped (PR #124, merged)

When a restaurant asks Donny (in-app chat) to create a campaign, the chat now hands a
distilled **brief** to the Create-a-Campaign builder so it opens **pre-filled** (lands on
the "Launchpad" with generated idea(s)) instead of a blank form.

## How it works

- The in-app Donny chat runs through the **`donny-orchestrator`** edge function (NOT
  `donny-chat` — that function's `create_campaign`/`generate_campaign` tools are not
  reachable from the chat UI).
- New sub-agent tool **`prepare_campaign`** (`tools.ts`): the orchestrator LLM calls it
  when the user wants to *start* a new campaign. Its handler (`agents/campaign.ts`
  `prepareCampaign`) builds a role-aware route
  `/dashboard/{business,brand}/campaigns/create?brief=<encoded>`. The brief is
  URL-encoded **server-side**, never by the LLM.
- `campaign_agent`'s description was tightened so creation intent routes to
  `prepare_campaign`, plus a system-prompt rule was added.
- Frontend `useCampaignCreator.ts` reacts to the `?brief=` param (deduped via a ref so it
  also fires on same-route navigation when the user is already on the builder), strips the
  param, and auto-runs the existing `submitInput(brief, 'text')` →
  `donny-campaign-generate` → pre-filled Launchpad. Reuses 100% of the existing generation
  + Launchpad flow; no new tables/migrations/RLS.

## Bug fixed along the way

The campaign summary path suggested route `/dashboard/brand/campaigns/new`, which is **not
a defined route** (real routes are `…/campaigns/create`). Now uses the shared role-aware
`createCampaignRoute` helper.

## Decisions

- Land on the **Launchpad** with generated idea(s) — reuse the proven flow (vs. a new
  single-draft editor entry mode).
- **Fresh generation is acceptable** — Donny seeds the generator from the chat brief; the
  pre-fill need not mirror Donny's exact chat wording.

## Affected files

- `supabase/functions/donny-orchestrator/tools.ts`
- `supabase/functions/donny-orchestrator/agents/campaign.ts`
- `supabase/functions/donny-orchestrator/index.ts`
- `src/hooks/useCampaignCreator.ts`

## Gotchas

- `donny-orchestrator` is an edge function — deploys **separately** from the frontend.
  Deployed to prod via the Supabase **CLI** (`npx supabase functions deploy
  donny-orchestrator --project-ref zocahiffooqdybdhguqv`), which auto-bundles all 17
  transitive files (9 function files + 8 `_shared`). The CLI was available + authenticated
  locally despite no `SUPABASE_ACCESS_TOKEN` env (stored session). This is far safer than
  hand-bundling 17 files through the MCP `deploy_edge_function` tool.
- The deployed `_shared` files differed from the worktree only by CRLF vs LF line endings
  (no content drift) — the worktree matched prod content.
- Codex second review: clean (after fixing a P2 — the initial mount-only `useState`
  capture missed same-route param changes; reworked to a reactive, deduped effect).
- Backward-compatible in any deploy order: old frontend ignores `?brief` (blank form as
  before); old orchestrator simply never emits the new route.
