---
title: Campaign Generation Creativity
type: concept
created: 2026-07-16
updated: 2026-07-16
sources: [2026-07-16-donny-campaign-creativity]
tags: [donny, campaign-generation, prompt-engineering, model-routing, cost-ledger]
---
# Campaign Generation Creativity

How Donny turns a business (a pasted URL, a photo, or a typed description) into campaign
ideas, and the 2026-07-16 rework (PR #243) that made those ideas stronger and more creative.
The generator is the `donny-campaign-generate` edge function; the profit-driving flow of the
platform. See [[Donny AI]].

## Key Decisions

### The diagnosis: weak output ≠ cost throttling
Business users reported the ideas "got weaker" after guardrails were added. The assumed
culprit — the AI **cost auto-downgrade** (which drops Donny to cheap Haiku@512 when spend is
high) — was **verified innocent against prod data**: campaign generation had run on full Sonnet
100% of the time, MTD AI spend was 0.3% of the $250 budget, and all users were `full_power`.
The real cause was **prompt/schema over-constraint** from the 2026-05-26 "Content Strategist"
update: a hard "MUST only use connected platforms / Do NOT suggest others" block, every creative
dimension locked to closed enums, prose capped to "<one sentence>," and a rigid content_strategy
schema. **Lesson: when generated output degrades, confirm which layer actually changed (query the
cost ledger / usage stage) before assuming the cost guardrail — the fix is usually the prompt.**

### The freed prompt (in a pure, testable `lib.ts`)
The system prompt, enums, and parser live in `donny-campaign-generate/lib.ts` — a pure module
with **no `https://` imports** so Vitest can load it (mirrors `generate-anonymous-brief/lib.ts`).
The relaxations: a **soft platform preference** (prioritize connected platforms, but one clearly
high-upside idea may lean on an unconnected one) instead of a hard ban; a free-form
`creative_concept` ("big idea") and exactly one bold `is_wildcard` per batch; relaxed "1–3
sentence" caps; the inert content_strategy block removed. The prompt is built by **string
concatenation with no backticks** (a stray backtick breaks the Deno bundle — guarded by a test),
and `parseCampaignJson` extracts the **outermost `{…}`** rather than trusting the whole string
(the premium model can emit a short preamble).

### Two surfaces, one path
Donny generates campaigns on two surfaces that had drifted: the paste-a-URL **builder** and
**chat** (`generate_campaign` tool). Chat used to forward to an older, drier prompt. Now it
forwards `source_type:"manual"` + composed `manual_text` to the **same strong path**, returning
**3 diverse concepts** with a bounded `max_tokens` (the synchronous chat sub-fetch stays fast and
can't truncate; a truncated parse becomes a retryable tool error, not a crash). The builder path
is async (see [[Campaign Generate Async Jobs Session]]), so premium-model latency is invisible.

### The model floor — never degrade the profit flow
`donny-campaign-generate` routes to a premium tier @ **8192 tokens** with a **`floor`**
(`getModelConfig`'s essential branch is `routing.floor ?? HAIKU`). Only campaign-generate defines
a `floor`, so it never silently drops to Haiku@512 in "essential" stage, while every other
function's Haiku degradation is unchanged. This closes a latent bug where the `essential` check
ran *before* `canDowngrade`. A new premium model needs its **exact-model-string** rate in the
cost-ledger (else spend falls back to Sonnet rates and the ≤15% kill-switch under-counts — see
[[AIOS Runtime Spend Source-of-Truth]]) and must reuse ledger tier `T3` (the CHECK allows only
T0–T3+embedding; no migration).

### Frontend crash-proofing precedes prompt loosening
A more creative prompt raises the odds of an off-menu/empty enum value. The single consumer
(`useCampaignCreator.ts`, validated by `campaignCreatorValidation.ts`) was hardened first:
`recommended_platforms` became `z.array(platformSchema.catch('multi_platform')).min(1).catch(['multi_platform'])`
(coerce off-menu, never throw on empty), the AI tagline is clamped to the 120-char launch cap, and
the new `creative_concept`/`is_wildcard` are surfaced (Wildcard badge + big-idea line, brand tokens).

## Known Issues
- **Shipped on Sonnet (`claude-sonnet-4-6`@8192), not Opus 4.8.** The plan chose Opus ("spend for
  quality"), but Opus access on the prod key was **unverifiable** — headless auth (no-password
  rule), a probe edge fn (classifier-blocked), CLI curl (mangled key), and browser generation
  (classifier-blocked) were all gated. The freed prompt is the fix regardless of model. **Opus is a
  one-line toggle:** `CAMPAIGN_PREMIUM.model` → `"claude-opus-4-8"` + redeploy (cost-ledger rate
  already in place); `claude-opus-4-8` rejects `temperature` (400) and runs thinking-off (hence the
  outermost-`{}` parser). Confirm org Opus access (next real generation → read edge logs), then flip.
- **Web access for fresh trends is a deferred follow-on.** Runtime Donny has no open-ended web
  search — only SSRF-guarded fetch of a specific URL. Anthropic's `web_search` server tool would
  need the token-only cost-ledger extended to capture per-search fees (see [[Self-Improving App]]
  for the founder-facing web-research loop that already exists on the cloud-routine rail).

## See Also
- [[Donny AI]] — the intelligence layer this generator belongs to
- [[AIOS Runtime Spend Source-of-Truth]] — the cost-ledger + ≤15% kill-switch the model tier feeds
- [[Campaign Generate Async Jobs Session]] — the builder's async job+poll transport
