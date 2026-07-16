# Donny Campaign-Idea Creativity — Design

- **Date:** 2026-07-16
- **Status:** Approved (spec-document-reviewer: Approved, 2 non-blocking refinements folded in)
- **Author:** Claude (with Dame)
- **Surfaces:** `donny-campaign-generate` edge fn, `donny-chat` edge fn, campaign-builder UI
- **Related:** `_shared/model-routing.ts`, `_shared/cost-ledger.ts`,
  `docs/wiki/concepts/anonymous-brief-generator.md`,
  `docs/wiki/concepts/aios-runtime-spend-source-of-truth.md`

## 1. Problem & diagnosis

Business users report Donny's AI campaign ideas became "not as strong and creative" after
"guardrails" were added. We investigated with **live production data** and the assumed cause is
wrong:

- **The cost/auto-downgrade guardrails never fired for campaigns.** Every `donny-campaign-generate`
  call in the last 90 days ran on full Sonnet (`claude-sonnet-4-6` @ 4096 tokens) — **zero** Haiku
  calls. Month-to-date AI spend is **$0.68 of the $250 budget (0.3%)**, and all users are
  `full_power`. Creative quality was not lost to cost-saving.
- **The real cause is prompt/schema over-constraint.** The 2026-05-26 "Donny Content Strategist"
  update (commit `8b1d93ed`) added a hard `platformConstraint` block ("You MUST … set platforms to
  ONLY connected ones … Do NOT suggest content for platforms the business has not connected"), locked
  every creative dimension (campaign type, platform, content type, aspect ratio, delivery tier,
  purpose, cadence) to **closed enums**, capped prose fields to "<one sentence>", and bolted on a
  rigid mandatory posting-plan schema.
- **The two surfaces drifted.** The paste-a-URL builder uses a "creative assistant" prompt
  (temperature 0.8); asking Donny **in chat** routes the `generate_campaign` tool to an older, drier
  "expert marketing strategist" prompt (temperature 0.7) with pre-seeded example values — so chat
  ideas are blander still.

## 2. Goals / non-goals

**Goals**
- Restore and strengthen creative quality on **both** the builder and the chat surfaces.
- Spend for quality (founder approved — there is ~unlimited headroom at 0.3% of budget).
- Keep the app-useful structure (enums the frontend renders; platform-awareness) while removing the
  creativity-strangling hard constraints.
- Preserve the cost-cap integrity invariant (`donny_cost_ledger` stays the honest source of truth).

**Non-goals (this effort)**
- Web access for Donny — a deliberately deferred follow-on (see §7). Founder chose creativity-first.
- Fixing the inert `content_strategy` UI path (pre-existing; zod strips it — out of scope).
- Touching auth, RLS, or the platform-wide cost-cap behavior for any other function.

## 3. Design

### 3.1 Frontend safety first (a looser prompt must not crash generation)

The **only** frontend consumer of the generated JSON is `src/hooks/useCampaignCreator.ts`, validated
by `donnyGenerateResponseSchema` in `src/lib/campaignCreatorValidation.ts` (types in
`src/types/campaignCreator.ts`). The chat `generate_campaign` result has **no** frontend consumer.

- `recommended_platforms` is today `z.array(platformSchema).min(1)` with **no `.catch()`** — one
  off-menu platform token throws and nukes the whole 3-idea batch. Make it resilient with **one
  coherent construction** (coerce strategy, no unreachable branch): element-level
  `.catch('multi_platform')` handles off-menu tokens, wrapped in an outer `.catch(['multi_platform'])`
  so a `.min(1)` failure on an empty array also can't throw. **This lands before/with the prompt
  loosening** — it is the key safety edit.
- `tagline` is capped at 120 chars by `launchValidationSchema` and re-validated at launch — keep
  tagline guidance short in the prompt.

### 3.2 Shared, testable prompt lib + relaxed prompt/schema

New pure module **`supabase/functions/donny-campaign-generate/lib.ts`** (no `https://` imports, so
Vitest loads it — mirrors `generate-anonymous-brief/lib.ts`). It holds **only the new-format**
system-prompt template literal, enum constant arrays, `CREATIVITY_TEMPERATURE = 0.9`, and
`parseCampaignJson`/`stripJsonFences`. Relaxations baked in:

- **Soft platform preference** replacing the hard MUST/ONLY/Do-NOT block: prioritize connected
  platforms (so ideas are actionable); MAY include **one** clearly high-upside idea leaning on an
  unconnected platform; never spend all three on channels they can't post to. Values still constrained
  to the six platform enum values.
- **Creative latitude:** add a free-form `creative_concept` (a vivid 2–3 sentence big idea/hook, not
  menu-constrained) and `is_wildcard: boolean` per idea; instruct one of three ideas to be a bold
  wildcard. Relax "<one sentence>" → "1–3 vivid sentences" on `description`, `style_direction`,
  `tier_reasoning`. Keep `tagline` short.
- **Remove the `content_strategy` generation block** from the new-format prompt: the frontend already
  strips it (zod omits it from `campaignIdeaSchema`), so it only wastes output tokens/attention, and
  it was welded to the hard-constraint block being deleted. (Its removal is why the token ceiling can
  now hold three richer ideas comfortably.)
- **No `temperature` param.** The premium model is Opus 4.8 (`claude-opus-4-8`), which **rejects
  `temperature`/`top_p`/`top_k` with a 400** — so campaign generation drops the sampling param
  entirely (creativity comes from the model + the freed prompt). Dropping it is also safe for the
  Sonnet-extended floor (uses its default). Opus 4.8 runs **without thinking by default** (keeps the
  response a single text block for parsing) but may emit a short preamble, so `parseCampaignJson`
  extracts the outermost `{…}` rather than trusting the whole string.

Companion **`lib.test.ts`**: soft guidance has no "MUST"/"ONLY"/"Do NOT"; references only the six
platform enum values; fence-stripping works; and a **backtick-guard** (the prompt is a
backtick-delimited template literal — a stray backtick breaks the Deno bundle, invisible to
`npm run build`).

`index.ts` new-format path wires to the `lib.ts` builders. **The legacy path is scoped down:** it gets
lighter "creative assistant" framing in its own inline prompt and **drops `temperature`** (same Opus
400 reason) — **no `creative_concept`, no schema change** — keeping its `{success, data}` shape
byte-identical for the remaining Chrome-extension/external OAuth callers (chat is moving off the
legacy path per §3.4, so no consumer could render a legacy `creative_concept` anyway). All existing
I/O (auth, `fetchAndExtract` SSRF guard, `logCost`, async-job plumbing) is unchanged.

**Truncation guard (chat's bounded budget must still fit valid JSON).** The chat forward runs the same
three-idea schema at a smaller `max_tokens` (§3.4), which risks truncating the JSON mid-object →
`JSON.parse` throws, and chat has no async job/poll to recover. So implementation must: (a) empirically
confirm the chosen chat budget (~3072) fits three *complete* ideas as valid JSON given the new
`creative_concept` + relaxed prose (removing `content_strategy` frees headroom in its favor; net cost
is unproven — if it doesn't fit, reduce chat-path field verbosity or concept count); and (b) handle a
truncated/invalid parse gracefully on the chat path (a clear tool error Donny can retry, not a hard
failure). The new caller-supplied `max_tokens` request param must be **clamped server-side** so an
external caller can't pass an absurd value.

### 3.3 Premium model tier + never-degrade-the-profit-flow + ledger honesty

**`_shared/model-routing.ts`**
- Add a premium creative model constant (**Opus-class**), `maxTokens: 8192`, `actionCost: 8`,
  **`tier: "T3"`** (reuse T3 — the `donny_cost_ledger` tier CHECK allows only T0–T3+embedding; a new
  "T4" without a widening migration is silently dropped by `logCost`, which swallows insert errors).
  Model id is **confirmed at build time via the `claude-api` skill** (likely `claude-opus-4-8`),
  along with per-token pricing and account access — no guessed id.
- Add optional `floor?: ModelConfig` to `FunctionRouting`; set `donny-campaign-generate` to
  `config: <premium>, canDowngrade: false, floor: SONNET_EXTENDED`.
- In `getModelConfig`, change **only** the essential branch: `return HAIKU;` → `return routing.floor
  ?? HAIKU;`. Only campaign-generate defines a `floor`, so every other function is byte-identical and
  still degrades to Haiku in essential. This also closes the latent bug where `essential` overrode
  `canDowngrade:false` and could gut the profit flow to Haiku@512.

**`_shared/cost-ledger.ts`** — add one `MODEL_COSTS` entry keyed by the **exact** new model id string
with confirmed rates (unknown keys silently fall back to Sonnet rates → the 15% kill-switch reads
low). Optional: extract `MODEL_COSTS` + a pure `getModelRates()` into `_shared/model-pricing.ts` for
unit-testability.

### 3.4 Chat unification — 3 diverse concepts

**`donny-chat/index.ts`** `generate_campaign` handler forwards to the **strong new-format path**:
compose `manual_text` from `brief` (+ `target_audience` + `budget_range`) and send
`source_type: 'manual'`. Donny then presents 3 diverse concepts (incl. the wildcard) in chat. Keep
`return { result: data }` (no consumer reads a specific shape); the prompt already works from a brief
alone.

**Latency guard (important — chat is synchronous, unlike the builder).** The chat forward is a
blocking sub-`fetch` inside a streamed `donny-chat` turn; it does **not** use the builder's async
job+poll path (that gates on `async===true && session-JWT`). So the "latency is invisible" argument in
§4 covers the builder only. To stay clear of the 150s idle / 400s wall-clock limits the project has
already fought (PRs #148/#232), the chat forward requests a **bounded `max_tokens`** (a new optional
request param, e.g. ~3072 — enough for three concise concepts) rather than the builder's full 8192, so
the sync generation returns fast. Confirm during implementation that `donny-chat` continues emitting
stream heartbeats around the `executeTool` sub-fetch (or that the bounded generation time stays well
under the idle window). The builder keeps the full premium @ 8192 via its async path.

Update the tool contract so Donny presents all three: change the `generate_campaign` tool
**description** (currently "Generate an AI-optimized campaign **brief**", singular) to state it returns
**multiple diverse concepts including a bold wildcard**, and add chat guidance to present all of them,
not collapse to one.

### 3.5 Frontend — surface the new creativity (additive, skew-safe)

- `campaignCreatorValidation.ts`: add `creative_concept: z.string().optional().default('')` and
  `is_wildcard: z.boolean().optional()` to `campaignIdeaSchema`.
- `campaignCreator.ts` types: add `creative_concept?: string`, `is_wildcard?: boolean`.
- `IdeaCard.tsx`: render `creative_concept` (a "Big idea" line) + a "Wildcard" badge.
- Optional: persist `creative_concept` in `useCampaignCreator.ts`. All additive/optional → an old
  edge deploy during the skew window still parses.

## 4. Key decisions

- **Diagnosis-driven:** the fix targets prompt/schema, not the cost system (which was never the
  cause). Musk's-algorithm ordering — delete the over-constraint before adding capability.
- **Opus-class premium model** for this one profit flow, with a **Sonnet floor** for real budget
  emergencies. Cost is trivial (even 10× ≈ $7/mo); the builder path is async, so latency is invisible.
- **Reuse tier `T3`** to stay inside the ledger CHECK; no migration.
- **Unify by forwarding**, not by duplicating the prompt — chat reuses the builder's strong path over
  the existing HTTP forward, so the prompt lives in one place (`donny-campaign-generate/lib.ts`). Chat
  runs the same path with a bounded token budget for responsiveness (§3.4).
- **Tier `T3` is now shared by two models** (the `SONNET_EXTENDED` floor and the Opus premium). Fine
  for the CHECK constraint and the cost-summing kill-switch, but ledger rows disambiguate by the
  **`model` string**, not `tier` — note for any future tier-based reporting.

## 5. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Looser prompt emits an off-menu platform → parse crash | Resilient `recommended_platforms` (`.catch`) shipped first |
| New model id mis-costed / silently dropped | Exact-string `MODEL_COSTS` entry + reuse tier T3; post-deploy ledger check |
| Template-literal backtick breaks the Deno bundle | `lib.test.ts` backtick-guard; `edge-function-reviewer` before deploy |
| `verify_jwt` reset on redeploy → OAuth/forward 401 | Ground-truth via `list_edge_functions`; preserve `false` on both fns |
| Chat behavior change (1 draft → 3 concepts) surprises users | Intentional, founder-approved |
| Long tagline fails launch validation | Keep tagline guidance ≤120 chars |
| Chat runs generation **synchronously** in a streamed turn → 150s idle / 504 risk | Bounded `max_tokens` on the chat forward (~3072) + heartbeat confirmation (§3.4); builder stays async |

## 6. Verification

- **Unit:** `npm run test` green incl. the floor regression guard (`model-routing.test.ts`: essential
  → Sonnet@8192, not Haiku@512) and the backtick guard.
- **Quality:** `scripts/campaign-quality-compare.ts` (`npx tsx`; needs `ANTHROPIC_API_KEY` + network)
  prints OLD (Sonnet@4096 + old prompt) vs NEW (premium@8192 + new prompt) side-by-side for 3–5
  representative fixtures — the founder eyeballs subjective quality. Read-only; output not committed.
- **Structural acceptance (deterministic, machine-checkable — assert in the script and/or a unit
  test):** exactly one `is_wildcard === true` per batch; `campaign_type` distinct across the three
  ideas; `creative_concept` non-empty on each; every `recommended_platforms` value in the six-enum
  set; at least one deliverable on a connected platform when platforms are supplied. These make the
  *intent* of the change testable even though idea quality is subjective.
- **Ledger honesty:** after the first real generation, confirm a `donny_cost_ledger` row with the new
  `model` string and a non-fallback `estimated_cost_usd`.
- **Prod:** `verify-prod` — generate in the builder AND ask Donny in chat; 3 strong concepts on both,
  both viewports, no console errors.
- **Deploy gates:** `careful` → `edge-function-reviewer` → CLI deploy + boot-check
  (`model=<id>, max_tokens=8192`) → `codex-review` → merge.
- **Knowledge:** `knowledge-sync` on branch finish.

## 7. Deferred follow-on — Donny web access ("trends + read links")

Separate future spec. Runtime Donny has no web search today (only SSRF-guarded fetch of a specific
URL, already built). Two flavors: (1) expose fetch-a-URL as a Donny tool (cheap, reuses
`fetchAndExtract`); (2) Anthropic native `web_search` server tool for open-ended
trends/seasonal/local-events. **Blocking gotcha:** `web_search` per-search fees are not captured by
the token-only cost-ledger — the 15% kill-switch would undercount, so the ledger must be extended
first. Also handle the 400s wall-clock and the expanded prompt-injection surface.
