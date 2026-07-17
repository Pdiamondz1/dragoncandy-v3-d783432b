# Session — Web Donny "find creators near me": the fix belongs in donny-orchestrator

- **Date:** 2026-07-16
- **Branch:** `feat/donny-orchestrator-find-creators`
- **Follow-on to:** PR #246 / #249 (both on `donny-chat` — the WRONG function for the consumer chat)

## The headline: two fixes on the wrong function, then the right one

The founder asked: as a business user, Donny should surface creators when asked ("find me creators
near Hoboken"). Earlier this session I fixed `donny-chat`'s `match_creators` tool (PR #246) and added
prompt guidance + `tool_choice` forcing (PR #249) — **and nothing changed on the web Donny, across
multiple redeploys.**

A network capture (`read_network_requests`, urlPattern `functions/v1`) finally showed why: the
**consumer web/mobile Donny chat calls `donny-orchestrator`**, not `donny-chat`.
- `src/hooks/useDonny.ts:157` → `donny-orchestrator` (consumer web + mobile)
- `src/hooks/internal/useInternalDonny.ts:79` → `donny-chat` (internal AIOS Donny only)

So all the `donny-chat` work served the internal surface. The consumer Donny's "I don't have that
tool" was **true, not a hallucination** — `donny-orchestrator` is a sub-agent router
(`campaign_agent`, `prepare_campaign`, `dragonshare_agent`, …, run inline as `agents/*.ts`) with **no
standalone creator-list tool** (matching was scoped to `campaign_agent` for existing campaigns).

**Durable lesson: capture the network request to confirm WHICH edge function a surface calls before
building — don't infer it from where the tool code lives.** A read-only investigation subagent mapped
the orchestrator + confirmed `_shared/geo.ts`/`creator-discovery.ts` are reusable and the frontend
renders text + nav buttons (not rich cards) today.

## The real fix (Option A) — live-verified

- **Relocated** `creator-discovery.ts` (+ `.test.ts`, 30 tests) to **`_shared/`** so both Donny
  surfaces share one tested scorer (proximity + niche + rating, never excludes) + `isCreatorDiscoveryIntent`.
- New **`donny-orchestrator/agents/creators.ts`** — `find_creators` sub-agent: queries public +
  completed `creator_profiles` (service-role RLS bypass → `profile_visibility='public'`, no rating
  pre-order, `.limit(500)`), resolves the center (explicit `location` OR the caller's `business_profiles`
  location via `.maybeSingle()`), ranks, returns `{context: <present-ready text list of real rows>,
  suggested_actions: [per-creator "View <name>" → /creator/<slug>, + "Browse all creators"]}`. Hands
  Claude real rows only (no fabrication); renders today as prose + button pills (zero frontend change).
- `tools.ts` — registers the `find_creators` tool.
- `index.ts` — `agentMap` wiring; `callClaude` gains an optional `toolChoice`; the FIRST call forces
  `{type:"tool", name:"find_creators"}` when `isCreatorDiscoveryIntent(query)` matches. The detector
  **excludes any "campaign" mention** (two Codex P2s) so campaign creation → `prepare_campaign` and
  campaign-specific asks ("top creators for my campaigns") → `campaign_agent` keep winning.

## Reviews / deploy / verification

- `edge-function-reviewer`: **PASS** (verify_jwt=true; no infinite loop — forced first call only;
  forced tool always in `allTools` even with the MCP merge; public+completed filter; reads-only;
  clean bundling; CORS/SSE unchanged).
- **Codex**: clean after 2 P2 heuristic fixes (exclude campaign-creation, then ANY campaign mention).
- **30 unit tests** pass.
- Deployed `donny-orchestrator` **v61** from the worktree (`verify_jwt=true` → **deploy WITHOUT
  `--no-verify-jwt`**).
- **LIVE-VERIFIED** as the business user Harbormill: "find me creators near Hoboken" → a ranked list —
  Ricky Ricardo · Charlie Smith · Elias Acevedo (2 mi away) · JGR Media · Paige · Soleil Castelo · …
  with distances + "View <name>" / "Browse All Creators" buttons. No denial. The founder's original
  ask, resolved on the correct surface.

## Fallout / notes

- **PR #249 (donny-chat forcing) is closed** — wrong function for the consumer goal.
- A concurrent session was actively redeploying edge fns (match-creators 236→237, donny-chat
  clobbered past my versions) and editing the wiki/social-proxy — a red herring layered on the
  wrong-function bug; the network capture was the decisive diagnostic.
- Deferred: rich avatar cards (Option B — make `donny_messages.rich_card` an array + renderer change);
  server-side lat/lng distance (shared scale path).

## Affected files

- `supabase/functions/_shared/creator-discovery.ts` (+ `.test.ts`) (new, relocated)
- `supabase/functions/donny-orchestrator/agents/creators.ts` (new)
- `supabase/functions/donny-orchestrator/tools.ts`, `index.ts`
