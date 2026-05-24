# Handoff: Donny AI Audit Remediation — Phase 2 (Quota + Streaming)

## Session Metadata
- Created: 2026-05-06 08:23:22
- Project: C:\GIT\dragoncandy-v3-d783432b
- Branch: main
- Session duration: ~2 hours

### Recent Commits (for context)
  - 8bf9582 fix: purge Donny cache from memory on logout
  - 1212410 a11y: swap HelpBriefDrawer custom div for shadcn Sheet
  - c55c08e security: standardize per-tool authorization checks in donny-chat
  - fceddf0 cost: add tier-based max_tokens clamping and tool-loop circuit breaker
  - da21c3e security: add prompt injection defenses to donny-chat
  - 8171e2e security: add role-based tool filtering to donny-chat

## Handoff Chain

- **Continues from**: None (new audit workstream)
- **Supersedes**: None

## Current State Summary

Phase 1 of the Donny AI audit remediation is complete. Six of eight audit findings from `docs/donny-ai-audit.docx` have been fixed across three files. Two items remain: #1 Monthly LLM quota enforcement (Critical severity, Medium effort) and #5 Streaming (Medium severity, Medium effort). After implementing both, a fresh audit pass should verify all 8 original findings are resolved. The user explicitly requested completing both remaining items and running the re-audit in the next session.

## Codebase Understanding

### Architecture Overview

Donny AI is the platform's AI assistant. The main chat handler is a Supabase Deno Edge Function (`donny-chat/index.ts`, now ~1,700 lines after Phase 1 additions). It calls Claude's API with 25 tool definitions, executes tool calls against Supabase, and returns the response synchronously. The frontend uses `useDonny.ts` (React Query mutation) to call the orchestrator edge function, which routes to `donny-chat`. Usage tracking exists via `_shared/usage-tracker.ts` with a `donny_usage` table that tracks `actions_used`, `actions_budget`, and `current_stage` per period.

### Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `supabase/functions/donny-chat/index.ts` | Main Donny chat handler — 25 tools, Claude API calls | Both #1 and #5 modify this file |
| `supabase/functions/_shared/usage-tracker.ts` | Usage stage computation, tier budgets, subscription tier lookup | #1 builds on this — `TIER_BUDGETS` and `getUserSubscriptionTier()` already exist |
| `supabase/functions/_shared/model-routing.ts` | Model selection (Haiku/Sonnet) by usage stage | #1 context — `UsageStage` type defined here |
| `src/hooks/useDonny.ts` | Frontend hook — sends messages via `donny-orchestrator`, manages state | #5 needs streaming support here |
| `src/components/donny/DonnyChatView.tsx` | Chat UI — renders messages | #5 needs streaming render |
| `src/components/donny/DonnyMessage.tsx` | Individual message component | #5 partial render target |
| `src/components/donny/DonnyTypingIndicator.tsx` | "Donny is typing" indicator | #5 replaces this with streaming text |
| `src/components/donny/DonnyChatInput.tsx` | Chat input bar | #5 needs send-button-disabled-while-streaming |
| `docs/donny-ai-audit.docx` | Original audit document | Re-audit source |
| `docs/donny-ai-audit.txt` | Plain text export of audit | Readable version |

### Key Patterns Discovered

- **Usage tracking already exists**: `donny_usage` table with `actions_used`, `actions_budget`, `current_stage` per `(user_id, period_start)`. `getUserUsageStage()` returns `full_power`/`conservation`/`essential`. `getUserSubscriptionTier()` returns `free`/`starter`/`growth`/`pro`/`enterprise`. Both are imported in `donny-chat/index.ts`.
- **TIER_BUDGETS already defined**: `_shared/usage-tracker.ts` line 11 has `{ free: 50, starter: 500, growth: 2000, pro: 10000, enterprise: 50000 }` — these are action budgets per month.
- **`incrementUsage()` already called**: After the tool loop in `donny-chat`, `incrementUsage(supabaseAdmin, userId, modelConfig.actionCost)` updates usage. So usage IS being tracked — what's missing is the ENFORCEMENT (returning 429 when budget is exceeded).
- **donny-chat currently returns synchronous JSON**: `new Response(JSON.stringify({ success: true, content, rich_card }))`. Streaming requires switching to `ReadableStream` with SSE format.
- **Frontend already has `isStreaming` and `streamingContent` state**: In `useDonny.ts`, these exist but are set/cleared without actual streaming data. They're placeholders for the streaming implementation.

## Work Completed

### Tasks Finished

- [x] Task 1: Role-based tool filtering (Critical) — commit `8171e2e`
- [x] Task 2: Prompt injection resistance (High) — commit `da21c3e`
- [x] Task 3: Dynamic max_tokens budgeting (High) — commit `fceddf0`
- [x] Task 4: Per-tool authorization hardening (Medium) — commit `c55c08e`
- [x] Task 5: HelpBriefDrawer a11y (Medium) — commit `1212410`
- [x] Task 6: Logout cache cleanup (Low) — commit `8bf9582`

### Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `supabase/functions/donny-chat/index.ts` | TOOLS_BY_ROLE, sanitizer, XML wrapping, max_tokens clamping, circuit breaker, per-tool auth | Audit items #2, #3, #4, #7 |
| `src/features/donny/HelpBriefDrawer.tsx` | Swapped custom div for shadcn Sheet | Audit item #6 |
| `src/hooks/useLogout.ts` | Added predicate-based removeQueries | Audit item #8 |

### Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Defer #1 quota and #5 streaming to Phase 2 | (A) All 8 at once, (B) Defer streaming only, (C) Defer both | Both need different types of changes (DB migration vs. response pipeline); six Low-effort fixes shipped first for immediate risk reduction |
| Use `campaigns!campaign_id(user_id)` join for file_uploads auth | (A) Nested join through campaign_collaborations, (B) Direct join via campaign_id FK | file_uploads has no FK to campaign_collaborations; campaign_id FK confirmed in migration |
| Use predicate-based removeQueries instead of queryKey prefix | (A) `queryKey: ['donny']` prefix, (B) Predicate with startsWith | TanStack Query prefix matching is array-element equality, not substring — predicate is correct |

## Pending Work

### Immediate Next Steps

1. **Brainstorm + design #1 Monthly LLM Quota Enforcement** — The usage tracking infrastructure (`donny_usage` table, `getUserUsageStage`, `TIER_BUDGETS`) already exists. What's missing is the hard enforcement: checking at the top of `donny-chat` whether the user has exceeded their monthly budget and returning 429 with an upgrade CTA. May not need a new migration if the existing `donny_usage` table suffices. Investigate before creating a new table.

2. **Brainstorm + design #5 Streaming** — Switch `donny-chat` from synchronous JSON response to SSE/chunked transfer. Frontend needs to consume the stream in `useDonny.ts`, render partial text in `DonnyMessage.tsx`, add retry button on errors, and disable send button while streaming. The `isStreaming`/`streamingContent` state already exists as placeholders.

3. **Create implementation plans for both** — Use writing-plans skill.

4. **Implement both** — Use subagent-driven-development.

5. **Run fresh audit** — Re-examine all 8 original findings against the updated codebase to verify complete remediation.

### Blockers/Open Questions

- Does the existing `donny_usage` table with `actions_used`/`actions_budget` suffice for quota enforcement, or does the audit specifically require a new `donny_usage_monthly` table? The audit spec mentions creating `donny_usage_monthly` but `donny_usage` already tracks per-period usage. Investigate before deciding.
- For streaming: does `donny-orchestrator` (which `useDonny.ts` actually calls) need to be modified too, or does it pass through to `donny-chat`? Check the orchestrator flow.

### Deferred Items

- None remaining after Phase 2 completes.

## Context for Resuming Agent

### Important Context

1. **The audit document is at `docs/donny-ai-audit.docx` (binary) and `docs/donny-ai-audit.txt` (plain text)**. Read the txt version.

2. **Phase 1 spec is at `docs/superpowers/specs/2026-05-06-donny-ai-audit-remediation-phase1-design.md`** — includes deferred Phase 2 section with requirements for both #1 and #5.

3. **Phase 1 plan is at `docs/superpowers/plans/2026-05-06-donny-ai-audit-remediation-phase1.md`** — all tasks completed.

4. **`donny-chat/index.ts` is now ~1,700 lines** after Phase 1 additions. Line numbers in the audit doc are stale — use grep to find current locations.

5. **Usage tracking infrastructure already exists** — `donny_usage` table, `getUserUsageStage()`, `getUserSubscriptionTier()`, `incrementUsage()`, `TIER_BUDGETS`. The issue is enforcement, not tracking.

6. **Frontend streaming placeholders exist** — `isStreaming` and `streamingContent` state in `useDonny.ts` are set/cleared but never populated with actual streaming data.

7. **The user wants a fresh audit after all fixes** — not just a checklist, but a proper re-examination of all 8 findings to confirm remediation.

8. **Use brainstorming skill before implementation** — the user's workflow is brainstorm → design spec → plan → implement with subagents.

9. **Session management** — use session-handoff skill if context reaches 55%.

### Assumptions Made

- The existing `donny_usage` table may be sufficient for quota enforcement without a new migration
- Streaming implementation will use Anthropic SDK's streaming mode (`stream: true`) with SSE forwarding
- The `donny-orchestrator` may need modification to support streaming passthrough

### Potential Gotchas

- `donny-chat/index.ts` line numbers have shifted significantly from Phase 1 edits — always grep for patterns, don't trust audit line numbers
- The tool loop (`while (result.stop_reason === "tool_use")`) complicates streaming — tool calls need to complete synchronously, only the final response can stream
- `useDonny.ts` calls `donny-orchestrator`, not `donny-chat` directly — the streaming path may need to go through (or bypass) the orchestrator
- Supabase Edge Functions use Deno's `ReadableStream` API, not Node's `stream` module

## Environment State

### Tools/Services Used

- Supabase (Postgres, Edge Functions, Realtime)
- Anthropic Claude API (Sonnet + Haiku routing)
- Vite (build tool, `npm run build`)
- Git on main branch

### Active Processes

- None running at handoff

### Environment Variables

- ANTHROPIC_API_KEY (edge function secret)
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (edge function secrets)
- VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (frontend env)

## Related Resources

- `docs/donny-ai-audit.txt` — original audit (plain text)
- `docs/superpowers/specs/2026-05-06-donny-ai-audit-remediation-phase1-design.md` — Phase 1 spec
- `docs/superpowers/plans/2026-05-06-donny-ai-audit-remediation-phase1.md` — Phase 1 plan (all done)
- `supabase/functions/_shared/usage-tracker.ts` — existing usage tracking code
- `supabase/functions/_shared/model-routing.ts` — model routing matrix

---

**Security Reminder**: Validated — no secrets in this document.
