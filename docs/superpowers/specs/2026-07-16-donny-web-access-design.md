# Donny Web Access — Design

- **Date:** 2026-07-16
- **Status:** Approved design (pre-implementation)
- **Branch:** `feat/donny-web-access`
- **Feature:** "Step 2 for Donny" — give the user-facing Donny agent live web access
  (search + read-a-URL) via the Anthropic client-tool loop, backed by Tavily.

> Architecture references below cite the `donny-chat` map produced during brainstorming
> (as of PR #234 / `7db01dfe`). This branch is on `origin/main` `08c49b2c` (PR #243), so
> exact line numbers may have shifted — anchor to the named symbols (`executeTool`,
> `runTurn`, `TOOL_DEFINITIONS`, `INTERNAL_TOOL_DEFINITIONS`, `TOOLS_BY_ROLE`, the
> internal/consumer branch) and re-verify line numbers during implementation.

## 1. Problem & goal

Today `donny-chat` (the Deno edge function that IS Donny) calls the Anthropic Messages
API with a fixed set of **client tools** and has **no web access**. Only the separate
cloud-routine rail (e.g. the Dezzy press/events scout) has web access, via the Claude Code
native `WebSearch` tool — a fundamentally different mechanism that donny-chat cannot borrow.

Goal: let Donny reach the live web — current trends, real-time facts, unfamiliar real-world
entities, and specific pages a user pastes — so its answers and campaign/content generation
are timely. Donny decides when to use it (broad, general-purpose access).

## 2. Scope

**In scope**
- Two new **client tools**: `web_search` and `read_url`, both backed by Tavily.
- Available on **both** surfaces: internal/AIOS Donny (effectively unmetered) and consumer
  Donny (metered).
- Cost governance: every Tavily call logged to `donny_cost_ledger`; per-user + global daily
  caps for consumers.
- New `_shared/tavily.ts` helper (pure request/response shaping + impure fetch).
- One new edge secret: `TAVILY_API_KEY`.

**Out of scope / deferred**
- Response caching (add later if runtime cost climbs).
- Per-plan-tier cap differentiation (flat consumer cap now; tier-differentiate when there's
  revenue).
- Our own SSRF-guarded outbound fetch — **not needed**: Tavily fetches server-side for both
  search and extract, so donny-chat makes no outbound page requests itself. (Only revisit if
  we ever drop Tavily.)
- Anthropic server-side `web_search` tool — explicitly rejected (see §4).

## 3. The two tools

Both are **client tools**: the model emits `tool_use`, the edge function executes it and
feeds back a `tool_result`. No new block types, so the freshly-stabilized streaming
accumulator / history reconstruction / tool-pairing logic (PRs #146/#148/#151) is untouched.

### `web_search`
```
name: "web_search"
description: "Search the live web for current information — trends, recent news,
  real-time facts, or details about a real-world business/place/person you're unsure of.
  Returns ranked results with extracted content. Always cite sources by URL."
input_schema:
  query:   string (required)
  recency: enum ["day","week","month","year","any"] (optional, default "any")
```
- Calls Tavily `/search` with `include_answer: true`, `max_results: 5`, and a `time_range`
  derived from `recency` — `day`/`week`/`month`/`year` map 1:1 to Tavily's `time_range`;
  `any` omits `time_range` entirely.
- Returns to the model: Tavily's concise `answer` (if present) + up to 5 results, each
  `{title, url, content}` with `content` truncated (~800 chars each). Bounded payload to
  keep input tokens controlled on subsequent tool rounds.

### `read_url`
```
name: "read_url"
description: "Fetch and read the main text of a specific web page (a menu, a competitor's
  site, an article, a link the user pasted). Returns clean extracted text."
input_schema:
  url: string (required)
```
- Calls Tavily `/extract` for the single URL (Tavily fetches server-side).
- Returns `{url, title?, content}` with `content` truncated (~5,000 chars, mirroring the
  anonymous-brief extractor's cap).

## 4. Architecture — where it plugs in (no engine changes)

**Rejected alternative (Approach B):** Anthropic's server-side `web_search` tool emits
`server_tool_use` / `web_search_tool_result` blocks that resolve inside one response. That
collides with `StreamAccumulator` (only forwards `text` + `tool_use`), `history.ts` /
`enforceToolPairing` (only understands `tool_use`/`tool_result`), and its per-search fee is
invisible to the token-only ledger. It pokes the most fragile, just-stabilized subsystem and
weakens cost control. **Chosen (Approach A):** client tools backed by Tavily.

**Integration points** (all additive):
1. **Tool definitions.** Add both tool schemas to:
   - `INTERNAL_TOOL_DEFINITIONS` (founder/AIOS Donny), and
   - the consumer `TOOL_DEFINITIONS`, plus the appropriate `TOOLS_BY_ROLE` allow-lists so
     each consumer role that should have web access gets it.
   The schemas must be **byte-static per surface/role** (they're part of the prompt-cache
   prefix) — no dynamic interpolation.
2. **Tool gating branch** (`index.ts:~1970-1987`, the internal-vs-consumer tool selection):
   unchanged in shape — internal gets `INTERNAL_TOOL_DEFINITIONS` (now incl. web tools),
   consumer gets role-filtered `TOOL_DEFINITIONS` (now incl. web tools for allowed roles).
3. **`executeTool` switch** (`index.ts:~795`): two new `case`s, `web_search` and `read_url`,
   that (a) enforce metering (§6), (b) call `_shared/tavily.ts`, (c) log cost (§6), and
   (d) return a bounded `tool_result`. The cases need `internalMode`, `userId`, and a
   service-role Supabase client for the count/log queries. donny-chat already constructs a
   service-role client (used by `logCost` in `runTurn` and by internal stats); **confirm
   during implementation whether `executeTool` receives it — if not, thread it (and
   `internalMode`/`userId`) into the web cases.** Prefer a small `webTools(ctx)` handler
   over widening the whole switch signature.
4. **`_shared/tavily.ts`** (new): pure `buildSearchRequest` / `shapeSearchResults` /
   `buildExtractRequest` / `shapeExtractResult` / `truncate`, plus one impure
   `tavilyFetch(path, body)` (POST + `AbortSignal.timeout(~8s)` + the retry pattern from
   `_shared/anthropic-fetch.ts`). Edge functions bundle `../_shared/*` automatically.

Because they're client tools, both tools work identically on the **consumer JSON path** and
the **internal NDJSON stream**, and on **any model** (no Haiku-downgrade concern that a
server tool would introduce).

## 5. Surfaces & gating

The internal-vs-consumer discriminator is unchanged: the stored conversation
`surface === "internal"` + session/service auth + admin role (never a client flag; never the
OAuth path). Internal Donny gets the web tools via `INTERNAL_TOOL_DEFINITIONS`; consumer
Donny via role-gated `TOOL_DEFINITIONS`. `verify_jwt = false` is preserved.

## 6. Metering & cost governance

**Ledger as the counter (no new table).** Every Tavily call logs one row to
`donny_cost_ledger` via a new `logWebToolCost(...)` in `_shared/cost-ledger.ts` (mirroring
the existing `logEmbeddingCost`): `edge_function: "donny-chat"`, `tier: "web_search"` (search)
or `tier: "web_extract"` (read_url), `input_tokens: 0`, `output_tokens: 0`,
`estimated_cost_usd:` a fixed per-call constant (`WEB_SEARCH_COST_USD`, `WEB_EXTRACT_COST_USD`).
This keeps web spend inside the runtime-spend source-of-truth (the ≤15%-of-revenue AI cap),
and the same rows serve as the rate counter.

**Caps (consumer only; internal bypasses both but still logs):**
- Per-user/day: **10** web-tool calls (`WEB_DAILY_PER_USER`).
- Global/day: **500** web-tool calls (`WEB_DAILY_GLOBAL`) — the real cost backstop, mirroring
  the anonymous-brief generator's global daily cap.
- "Today" = UTC calendar day (`created_at >= date_trunc('day', now())`).

**Enforcement (in each web `case`, before calling Tavily):**
1. If `internalMode` → skip caps (still log cost after).
2. Else count `donny_cost_ledger` rows where `tier IN ('web_search','web_extract')` and
   `created_at >= start_of_today`, once filtered by `user_id` (per-user) and once global
   (two `head:true` count queries via the service-role client per §4.3).
3. If over either cap → return a graceful `tool_result`
   (`{ error: "Daily web-search limit reached (10/day). Try again tomorrow." }` /
   global-busy message) so Donny narrates it instead of the turn erroring.
4. Else call Tavily, then `logWebToolCost`.

Both tools count against the **same** daily budget. Check-then-act allows minor overage under
concurrency — acceptable for a soft cost control (documented, not fixed in v1). Add an index
on `donny_cost_ledger (user_id, created_at)` if the count query is slow (likely already
covered; verify).

**Result/token bounding** (also cost control): search = top 5 × ~800 chars + answer;
extract = ~5,000 chars. Prevents web results from ballooning input tokens across the
≤10 tool rounds.

## 7. System prompt

A short, **byte-static** block appended to both `buildSystemPrompt` and
`buildInternalSystemPrompt` (kept out of the volatile section so prompt-caching holds):
when to use `web_search` (current/real-time info, trends, unfamiliar real-world entities) and
`read_url` (a specific link), and to **cite sources by URL** and note when info may be
time-sensitive.

## 8. Error handling

- Tavily non-2xx / timeout (`AbortSignal.timeout ~8s`) → `tool_result`
  `{ error: "Web search is temporarily unavailable." }`.
- Empty results → `tool_result` `{ results: [], note: "No results found." }`.
- Missing `TAVILY_API_KEY` → `tool_result` error (fail-soft; Donny explains web is off) — the
  turn never crashes.
- Over-cap → §6.
All returned as normal `tool_result` content (internal to the model), not client-facing HTTP
errors — the turn always completes.

## 9. Config & secrets

- New edge secret **`TAVILY_API_KEY`** (Supabase Edge Function Secrets; not Vault).
- Constants in code (v1): `WEB_DAILY_PER_USER=10`, `WEB_DAILY_GLOBAL=500`,
  `WEB_SEARCH_COST_USD`, `WEB_EXTRACT_COST_USD`, `SEARCH_MAX_RESULTS=5`,
  `SEARCH_CONTENT_CHARS≈800`, `EXTRACT_CONTENT_CHARS≈5000`, `TAVILY_TIMEOUT_MS≈8000`.
  (Could migrate to a config table later; hardcoded is fine for v1.)

## 10. Testing

- Unit tests for the pure `_shared/tavily.ts` functions (request building incl. `recency`→
  `time_range` mapping, response→results shaping, truncation, missing-field handling) and the
  cap math helper (`isOverCap`).
- Unit test `logWebToolCost` shape (tier + fixed cost).
- `executeTool` web cases stay thin wrappers around the tested helpers.
- Follow the repo pattern: helpers avoid runtime `https://` imports so vitest can load them.

## 11. Deployment

1. Set `TAVILY_API_KEY` edge secret.
2. Run the `edge-function-reviewer` subagent, then deploy `donny-chat` via Supabase CLI
   (`supabase functions deploy donny-chat --no-verify-jwt --project-ref zocahiffooqdybdhguqv`)
   — the function is large (~170KB+ w/ deps); CLI bundles from disk (incl. the new
   `_shared/tavily.ts`). **Preserve `verify_jwt = false`.**
3. `_shared/cost-ledger.ts` gains an additive `logWebToolCost` export — other functions
   importing it are unaffected.
4. Verify: internal Donny can search/read; a consumer account is capped at 10/day; ledger
   rows appear with `tier IN ('web_search','web_extract')`.
5. Codex second review before PR.

## 12. Open defaults (approved unless changed)

- Caps: 10/user/day, 500/day global.
- Both tools ship together.
- Tavily as the provider (one new secret).
