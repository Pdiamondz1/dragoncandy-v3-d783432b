# Session — Donny wouldn't call match_creators; tool_choice forcing (fix/donny-surface-creators-in-chat)

- **Date:** 2026-07-16
- **Branch:** `fix/donny-surface-creators-in-chat`
- **Follow-on to:** PR #246 (Donny chat `match_creators` distance+skill fix)

## What prompted it

A **live E2E check** of PR #246 (as the business user "Harbormill" in Donny chat) revealed the tool
fix was correct but **effectively unreached**: Donny would not call `match_creators` at all.
- "find me creators near Hoboken" → redirected to the Find Creators page.
- "show me top creators" → redirected to campaign creation ("you don't have any active campaigns").
- Explicit "use your match_creators tool" → Donny **falsely claimed it didn't have the tool**.

Code trace confirmed the tool **is** in the payload: `match_creators` is in
`TOOLS_BY_ROLE.business_client`/`brand` and is filtered into `allowedTools` (`index.ts:2015`), and
its description (from #246) is strong. So the redirect/denial was **emergent LLM behaviour**, not a
gating bug, and the system prompt had no intentional funnel-steering away from creators.

## What shipped (two escalating fixes)

1. **Prompt guidance (necessary, not sufficient).** Two additive `## Rules` lines in
   `buildSystemPrompt` telling Donny to call `match_creators` for creator-discovery requests, not
   deny/redirect; scoped "only when match_creators is one of your available tools" so it's accurate
   for `content_creator` (which lacks the tool) — an edge-function-reviewer [low] catch. **Deployed,
   but on its own it did NOT change behaviour** — the same (poisoned) conversation still redirected
   and denied. Root cause: the conversation's own prior "I don't have that tool" turns are replayed
   (last-50-message history) and the model self-anchors to them over the system prompt.

2. **Deterministic `tool_choice` forcing (the real fix).** A pure, unit-tested
   `isCreatorDiscoveryIntent(message)` in `donny-chat/creator-discovery.ts` (requires a
   `creators`/`influencers` noun + a discovery verb or proximity cue; excludes other creator-objects
   — applications/pay/paid/payout/invoice/escrow/message/invite/contract/dispute — to avoid forcing
   the wrong tool). When it matches, `!internalMode`, and `match_creators` is in `allowedTools`,
   `runTurn` forces `tool_choice: {type:"tool", name:"match_creators"}` on the **first** `callModel`
   only (continuations run auto → no infinite loop). `callModel` gained an optional `toolChoice`.
   Because `tool_choice` is an **API-level constraint the model must obey**, it works regardless of
   prompt reluctance or poisoned history.

## Reviews / verification

- `edge-function-reviewer`: **PASS** — no infinite loop (forced first-call only, fresh object
   literals downstream), forced tool structurally always in the list (`allowedTools.some(...)` +
   `!internalMode` double-guard; `INTERNAL_TOOL_DEFINITIONS` has no `match_creators`), valid
   Anthropic shape, clean bundling, `verify_jwt=false`.
- **Codex**: clean after **2 P2** heuristic fixes — add `pay`/`paid` to the exclusion (else "how do
   creators get paid?" wrongly forced the tool via the `get` verb), then drop the over-broad
   `collaborat`/`review` stems (they suppressed valid "find creators to collaborate with" / "creators
   with the best reviews").
- 29 unit tests pass (both directions of the intent detector locked).
- **Deployed** `donny-chat` from the worktree via CLI (`--no-verify-jwt` preserved). Git collision
   check clean (origin/main had no donny-chat change since the base).
- **Live E2E re-verification blocked:** the app's session logged out mid-test (3-hr inactivity
   timeout / token expiry → both tabs on `/auth`); credentials are off-limits, so the founder must run
   the one-line check ("find me creators near Hoboken" in Donny) or re-auth. The fix is
   API-deterministic + unit-tested, so confidence is high; the browser confirmation is pending.

## Durable lessons

- **You cannot reliably prompt a model out of a stance it already took in-context.** Once Donny said
   "I don't have that tool", replaying that history anchored it; the improved system prompt lost.
- **When a tool must fire on a detected intent, force it with `tool_choice`, don't persuade.** Detect
   the intent deterministically (a tested pure function) and force the specific tool on the first
   turn only, guarded so the forced tool is always in the payload.

## Affected files

- `supabase/functions/donny-chat/index.ts` (buildSystemPrompt rules; `callModel` toolChoice;
  `runTurn` firstToolChoice)
- `supabase/functions/donny-chat/creator-discovery.ts` (+ `.test.ts`) — `isCreatorDiscoveryIntent`
