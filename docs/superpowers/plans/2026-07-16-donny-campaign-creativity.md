# Donny Campaign-Idea Creativity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Donny's AI campaign ideas markedly stronger and more creative on both the paste-a-URL builder and Donny chat, by loosening an over-constrained prompt, unifying the two surfaces, and moving this one profit flow to an Opus-class model — without breaking the frontend that renders the output or the cost-ledger that governs the AI spend cap.

**Architecture:** Backend edge functions (`donny-campaign-generate`, `donny-chat`) call the Anthropic Messages API directly. A new pure `donny-campaign-generate/lib.ts` holds the (relaxed) prompt, enums, and a robust JSON parser. Model selection flows through `_shared/model-routing.ts`; spend is logged by `_shared/cost-ledger.ts`. The single frontend consumer validates the JSON with a Zod schema in `src/lib/campaignCreatorValidation.ts`.

**Tech Stack:** Deno edge functions (TypeScript), Anthropic Claude API (`claude-opus-4-8`), React + Zod, Vitest.

**Branch:** `feat/donny-campaign-creativity` (already created in worktree `dc-issues-5`).

**Spec:** `docs/superpowers/specs/2026-07-16-donny-campaign-creativity-design.md` (approved). This plan refines two spec details discovered from the Claude API reference: (1) the premium model is `claude-opus-4-8`, which **rejects `temperature`** → we drop the param entirely; (2) Opus 4.8 runs without thinking by default and may emit a preamble → the parser extracts the outermost JSON object.

**Key model facts (from the `claude-api` skill, confirm account access at deploy — Task 9):**
- `claude-opus-4-8` — input **$5.00/1M** (`0.000005`/token), output **$25.00/1M** (`0.000025`/token). Works with `anthropic-version: 2023-06-01`. Do **not** send `temperature`/`top_p`/`top_k` (400). Omit `thinking` (runs without thinking → single text block). No beta header needed.

---

## Task 1: Make the frontend crash-proof BEFORE loosening the prompt

A more creative prompt raises the odds of an off-menu or empty `recommended_platforms`, which today throws and nukes the whole 3-idea batch.

**Files:**
- Modify: `src/lib/campaignCreatorValidation.ts:48`
- Test: `src/lib/campaignCreatorValidation.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/campaignCreatorValidation.test.ts
import { describe, it, expect } from 'vitest';
import { campaignIdeaSchema } from './campaignCreatorValidation';

const baseIdea = {
  id: 'x', emoji: '🔥', title: 'T', description: 'D',
  campaign_type: 'ugc_content',
  deliverables: [{ description: 'd', content_type: 'video_reel', platform: 'instagram', aspect_ratio: '9:16' }],
  timeline_days: 7, tier: 'standard', tier_reasoning: 'r', style_direction: 's',
  target_creator_persona: ['p'], key_messages: ['m'], hashtags: ['#h'],
};

describe('recommended_platforms resilience', () => {
  it('coerces an off-menu platform token instead of throwing', () => {
    const parsed = campaignIdeaSchema.parse({ ...baseIdea, recommended_platforms: ['linkedin', 'instagram'] });
    expect(parsed.recommended_platforms).toContain('instagram');
    expect(parsed.recommended_platforms).not.toContain('linkedin');
  });
  it('never throws on an empty array', () => {
    const parsed = campaignIdeaSchema.parse({ ...baseIdea, recommended_platforms: [] });
    expect(parsed.recommended_platforms.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/lib/campaignCreatorValidation.test.ts` → FAIL (empty array throws on `.min(1)`).

- [ ] **Step 3: Make `recommended_platforms` resilient** — in `src/lib/campaignCreatorValidation.ts`, change line 48 from:

```ts
  recommended_platforms: z.array(platformSchema).min(1),
```
to (one coherent construction — element-level `.catch` coerces off-menu tokens; the outer `.catch` covers an empty array so `.min(1)` can't throw):
```ts
  recommended_platforms: z.array(platformSchema.catch('multi_platform')).min(1).catch(['multi_platform']),
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit** — `git add src/lib/campaignCreatorValidation.ts src/lib/campaignCreatorValidation.test.ts && git commit -m "fix(campaign-creator): make recommended_platforms crash-proof for looser prompt"`

---

## Task 2: Surface the new creative fields in the schema, types, and UI (additive)

**Files:**
- Modify: `src/lib/campaignCreatorValidation.ts:41-59` (add two optional fields to `campaignIdeaSchema`)
- Modify: `src/types/campaignCreator.ts:30-49` (`CampaignIdea`)
- Modify: `src/components/campaign-creator/IdeaCard.tsx`

- [ ] **Step 1:** Add to `campaignIdeaSchema` (after `tagline`, line ~46):
```ts
  creative_concept: z.string().optional().default(''),
  is_wildcard: z.boolean().optional(),
```
- [ ] **Step 2:** Add to `CampaignIdea` in `src/types/campaignCreator.ts`:
```ts
  creative_concept?: string;
  is_wildcard?: boolean;
```
- [ ] **Step 3:** In `IdeaCard.tsx`, render the concept + a wildcard badge (brand colors — **no gray**, per design rules). After the title/description block (`</div>` at line 26), before the chips row, add:
```tsx
      {idea.is_wildcard && (
        <span className="inline-block mt-2 rounded-full bg-dc-pink/50 px-2 py-1 text-xs font-bold text-dc-pink-accent">
          ✦ Wildcard
        </span>
      )}
      {idea.creative_concept && (
        <p className="mt-2 text-sm italic text-dc-text-muted line-clamp-3">
          {idea.creative_concept}
        </p>
      )}
```
- [ ] **Step 4:** `npm run typecheck` → clean. `npm run build` → succeeds.
- [ ] **Step 5: Commit** — `git commit -am "feat(campaign-creator): surface creative_concept + wildcard badge"`

---

## Task 3: Create the shared prompt lib + robust parser (`donny-campaign-generate/lib.ts`)

Pure module, **no `https://` imports** (so Vitest loads it), mirroring `generate-anonymous-brief/lib.ts`. Holds the relaxed prompt (soft platform preference, `creative_concept`, one wildcard, relaxed prose caps, **no `content_strategy` block**), the enum arrays, and `parseCampaignJson`.

**Files:**
- Create: `supabase/functions/donny-campaign-generate/lib.ts`
- Create: `supabase/functions/donny-campaign-generate/lib.test.ts`

- [ ] **Step 1: Write `lib.test.ts` first**

```ts
import { describe, it, expect } from 'vitest';
import { buildDonnyFirstSystemPrompt, buildDonnyFirstUserPrompt, parseCampaignJson, PLATFORMS } from './lib.ts';

describe('buildDonnyFirstSystemPrompt', () => {
  const withPlatforms = buildDonnyFirstSystemPrompt([{ platform: 'instagram', platform_handle: null }]);
  it('uses a soft preference, not a hard ban', () => {
    expect(withPlatforms).not.toMatch(/\bMUST\b/);
    expect(withPlatforms).not.toMatch(/\bONLY\b/);
    expect(withPlatforms).not.toMatch(/Do NOT suggest/i);
    expect(withPlatforms).toMatch(/prioritize/i);
  });
  it('embeds the connected platform list', () => {
    expect(withPlatforms).toMatch(/instagram/);
  });
  it('references only the six platform enum values in guidance', () => {
    // guard against inventing an off-enum network in the prompt
    for (const bad of ['linkedin', 'pinterest', 'snapchat', 'x.com']) {
      expect(withPlatforms.toLowerCase()).not.toContain(bad);
    }
  });
  it('drops the content_strategy block', () => {
    expect(withPlatforms).not.toMatch(/content_strategy/);
  });
  it('asks for exactly one wildcard and a creative_concept', () => {
    expect(withPlatforms).toMatch(/is_wildcard/);
    expect(withPlatforms).toMatch(/creative_concept/);
  });
  it('has no stray backtick (Deno bundle hygiene — belt-and-suspenders; lib.ts uses string concat)', () => {
    expect(withPlatforms.includes('`')).toBe(false);
    expect(buildDonnyFirstSystemPrompt().includes('`')).toBe(false);
  });
});

describe('parseCampaignJson', () => {
  it('strips ```json fences', () => {
    expect(parseCampaignJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('extracts the object even with a leading preamble (Opus-no-thinking safety)', () => {
    expect(parseCampaignJson('Here are three ideas:\n{"a":1}')).toEqual({ a: 1 });
  });
  it('throws when there is no JSON object', () => {
    expect(() => parseCampaignJson('no json here')).toThrow();
  });
});

describe('PLATFORMS', () => {
  it('is the six-value enum', () => {
    expect(PLATFORMS).toEqual(['instagram', 'tiktok', 'facebook', 'youtube', 'google_business', 'multi_platform']);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run supabase/functions/donny-campaign-generate/lib.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write `lib.ts`.** ⚠️ **No backticks anywhere inside the exported prompt string** (Deno bundle footgun — invisible to `npm run build`, only fails at `functions deploy`; the test above guards it).

```ts
// Pure prompt/enum/parse helpers for donny-campaign-generate. No network imports
// so Vitest can load this. See docs/superpowers/specs/2026-07-16-donny-campaign-creativity-design.md

export const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube', 'google_business', 'multi_platform'] as const;

function softPlatformGuidance(
  connectedPlatforms?: Array<{ platform: string; platform_handle: string | null }>,
): string {
  const connected = connectedPlatforms?.map((p) => p.platform).join(', ');
  if (connected) {
    return '\n\nCONNECTED PLATFORMS: ' + connected +
      '\nPrioritize these — most deliverables and each idea\'s recommended_platforms should target ' +
      'platforms the business can already post to, so the ideas are immediately actionable. You MAY ' +
      'include ONE clearly high-upside idea that leans on a platform they have not connected yet; if ' +
      'you do, make its upside obvious. Never spend all three ideas on platforms they cannot post to. ' +
      'Every platform value must be one of: instagram, tiktok, facebook, youtube, google_business, multi_platform.';
  }
  return '\n\nNo social platforms are connected yet. Suggest a diverse mix of platforms across the three ideas ' +
    '(each value one of: instagram, tiktok, facebook, youtube, google_business, multi_platform).';
}

export function buildDonnyFirstSystemPrompt(
  connectedPlatforms?: Array<{ platform: string; platform_handle: string | null }>,
): string {
  return 'You are Donny, a bold, creative campaign strategist for DragonCandy — a marketplace ' +
    'connecting local businesses with content creators. Your ideas should feel fresh, specific, and ' +
    'worth paying for, not generic.\n\n' +
    'Given information about a business, you will:\n' +
    '1. Extract structured business context (name, location, cuisine/category, vibe).\n' +
    '2. Generate exactly 3 DIVERSE campaign ideas. Each idea must be a DIFFERENT campaign_type.\n' +
    '3. Make EXACTLY ONE of the three a bold "wildcard" (is_wildcard: true) — push further creatively ' +
    'on that one (an unexpected angle, format, or hook). The other two have is_wildcard: false.\n\n' +
    'campaign_type: ugc_content, launch_hype, ongoing_presence, event_promo, seasonal.\n' +
    'platforms: instagram, tiktok, facebook, youtube, google_business, multi_platform.\n' +
    'content_type: photo, video_reel, story, carousel, tiktok, youtube_short.\n' +
    'aspect_ratio: 9:16, 16:9, 1:1, 4:5.\n' +
    'tier: dragondash (rush, 1-3 hours), express (24-48 hours), standard (5-7 days).' +
    softPlatformGuidance(connectedPlatforms) +
    '\n\nOutput ONLY raw JSON matching this exact schema — no preamble, no markdown fences, no ' +
    'commentary before or after:\n' +
    '{\n' +
    '  "business_context": {\n' +
    '    "source_url": "<url or empty string>",\n' +
    '    "source_type": "<google_business|instagram|website|yelp|photo|manual>",\n' +
    '    "business_name": "<name>",\n' +
    '    "cuisine_type": "<type or null>",\n' +
    '    "location": { "city": "<city>", "state": "<state or null>", "country": "<country>" },\n' +
    '    "rating": <number or null>,\n' +
    '    "review_count": <number or null>,\n' +
    '    "price_range": "<$ or $$ or $$$ or $$$$ or null>",\n' +
    '    "photos": [],\n' +
    '    "vibe_tags": ["<tag>"],\n' +
    '    "review_highlights": ["<highlight>"],\n' +
    '    "social_links": { "instagram": "<url or null>", "tiktok": "<url or null>", "website": "<url or null>" }\n' +
    '  },\n' +
    '  "campaign_ideas": [\n' +
    '    {\n' +
    '      "id": "<uuid>",\n' +
    '      "emoji": "<single emoji>",\n' +
    '      "title": "<short catchy title>",\n' +
    '      "creative_concept": "<the bold big idea and hook in 2-3 vivid sentences — not from any menu, be specific to THIS business>",\n' +
    '      "is_wildcard": <true for exactly one idea, false for the others>,\n' +
    '      "description": "<1-3 sentences describing the campaign>",\n' +
    '      "campaign_type": "<one campaign_type>",\n' +
    '      "recommended_platforms": ["<platform>"],\n' +
    '      "deliverables": [\n' +
    '        { "description": "<what the creator makes>", "content_type": "<content_type>", "platform": "<platform>", "aspect_ratio": "<aspect_ratio>", "estimated_duration": <seconds or null> }\n' +
    '      ],\n' +
    '      "price": <number>,\n' +
    '      "timeline_days": <number>,\n' +
    '      "tier": "<dragondash|express|standard>",\n' +
    '      "tier_reasoning": "<1-2 sentences>",\n' +
    '      "style_direction": "<1-3 sentences of visual/tonal direction>",\n' +
    '      "target_creator_persona": ["<persona>"],\n' +
    '      "key_messages": ["<message>"],\n' +
    '      "hashtags": ["<hashtag>"],\n' +
    '      "tagline": "<punchy tagline, 120 characters or fewer>"\n' +
    '    }\n' +
    '  ]\n' +
    '}';
}

export function buildDonnyFirstUserPrompt(pageContent: string, sourceType: string, role: string | null): string {
  return 'Source type: ' + sourceType + '\nRole: ' + (role || 'anonymous') +
    '\n\nBusiness information:\n' + pageContent +
    '\n\nGenerate 3 diverse campaign ideas (one wildcard) based on this business.';
}

// Opus 4.8 runs without thinking by default and may emit a short preamble before
// the JSON, so extract the outermost { ... } rather than trusting the whole string.
export function parseCampaignJson(rawText: string): unknown {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model response');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}
```

- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** — `git add supabase/functions/donny-campaign-generate/lib.ts supabase/functions/donny-campaign-generate/lib.test.ts && git commit -m "feat(donny-campaign-generate): extract relaxed prompt + robust parser into lib.ts"`

---

## Task 4: Wire the builder path to lib.ts, drop temperature, add a clamped max_tokens override

**Files:** Modify `supabase/functions/donny-campaign-generate/index.ts`

- [ ] **Step 1:** At the top, import the lib:
```ts
import { buildDonnyFirstSystemPrompt, buildDonnyFirstUserPrompt, parseCampaignJson } from "./lib.ts";
```

- [ ] **Step 2:** Replace the body of `generateCampaignIdeas` (lines ~110-251). Remove `platformConstraint`, `contentStrategySchema`, the inline `systemPrompt`/`userPrompt`, and **`temperature`**. Add an optional `maxTokensOverride` param (clamped). New shape:
```ts
async function generateCampaignIdeas(
  pageContent: string,
  sourceType: string,
  role: string | null,
  modelConfig: ModelConfig,
  connectedPlatforms?: Array<{ platform: string; platform_handle: string | null }>,
  maxTokensOverride?: number,
): Promise<{ result: { business_context: Record<string, unknown>; campaign_ideas: unknown[] }; usage: { input_tokens: number; output_tokens: number } }> {
  const systemPrompt = buildDonnyFirstSystemPrompt(connectedPlatforms);
  const userPrompt = buildDonnyFirstUserPrompt(pageContent, sourceType, role);
  // Clamp any caller override into [512, modelConfig.maxTokens]; default to the full budget.
  const maxTokens = Math.min(Math.max(maxTokensOverride ?? modelConfig.maxTokens, 512), modelConfig.maxTokens);

  const requestBody = {
    model: modelConfig.model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    // NOTE: no `temperature` — claude-opus-4-8 rejects sampling params (400).
  };
  console.log(`[campaign-generate] Calling Anthropic: model=${modelConfig.model}, max_tokens=${maxTokens}, prompt_len=${userPrompt.length}`);

  const response = await anthropicFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(requestBody),
  }, 0);

  if (!response.ok) {
    const err = await response.text();
    console.error(`[campaign-generate] Anthropic API failed: status=${response.status}, body=${err}`);
    throw new Error(`Anthropic ${response.status}: ${err.slice(0, 300)}`);
  }
  const data = await response.json();
  // With thinking off, content[0] is the text block; use find() defensively.
  const rawContent: string = (data.content ?? []).find((b: { type?: string }) => b.type === "text")?.text ?? "{}";
  return {
    result: parseCampaignJson(rawContent) as { business_context: Record<string, unknown>; campaign_ideas: unknown[] },
    usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 },
  };
}
```

- [ ] **Step 3:** Thread the override through `NewFormatBody` and `runNewFormatGeneration`:
  - Add `max_tokens?: number;` to `interface NewFormatBody` (line ~253).
  - In `runNewFormatGeneration` (line ~275), pass `body.max_tokens` as the 6th arg to `generateCampaignIdeas(...)` (line ~318): `..., connected_platforms, body.max_tokens)`. (No destructure needed — read `body.max_tokens` directly.)

- [ ] **Step 4:** `npm run build` (frontend build won't catch a Deno issue — Task 9 boot-check does). `npx vitest run supabase/functions/donny-campaign-generate/lib.test.ts` still green.
- [ ] **Step 5: Commit** — `git commit -am "feat(donny-campaign-generate): builder path uses lib.ts, drops temperature, clamped max_tokens"`

---

## Task 5: Upgrade the legacy path (framing + drop temperature; no schema change)

The legacy path serves Chrome-extension/external OAuth callers and must keep its `{success, data}` shape byte-identical. Give it creative framing and remove `temperature`.

**Files:** Modify `supabase/functions/donny-campaign-generate/index.ts` (lines ~576-625)

- [ ] **Step 1:** Change the legacy system prompt intro (line 576) from `"You are an expert marketing strategist for DragonCandy..."` to `"You are Donny, a bold, creative campaign strategist for DragonCandy, a platform connecting local businesses with content creators. Generate a compelling, specific campaign draft — fresh, not generic."` Keep the rest of `legacySystemPrompt` (the JSON structure) unchanged.
- [ ] **Step 2:** In the legacy request body (lines ~613-624), **delete the `temperature: 0.7` line** (Opus 400). Leave `model`, `max_tokens`, `system`, `messages`.
- [ ] **Step 3:** `npm run build`. **Grep guard:** `grep -n "temperature" supabase/functions/donny-campaign-generate/index.ts` → **no matches** (both paths clean).
- [ ] **Step 4: Commit** — `git commit -am "feat(donny-campaign-generate): legacy path creative framing, drop temperature"`

---

## Task 6: Premium model tier + never-degrade-the-profit-flow (model-routing)

**Files:**
- Modify: `supabase/functions/_shared/model-routing.ts`
- Test: `supabase/functions/_shared/model-routing.test.ts` (create)

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from 'vitest';
import { getModelConfig, getActionCost } from './model-routing.ts';

describe('getModelConfig — campaign generation premium tier + floor', () => {
  it('full_power → Opus @ 8192', () => {
    const c = getModelConfig('donny-campaign-generate', 'full_power');
    expect(c.model).toBe('claude-opus-4-8');
    expect(c.maxTokens).toBe(8192);
  });
  it('conservation → still Opus (canDowngrade:false)', () => {
    expect(getModelConfig('donny-campaign-generate', 'conservation').model).toBe('claude-opus-4-8');
  });
  it('essential → Sonnet @ 8192 FLOOR, never Haiku@512 (regression guard)', () => {
    const c = getModelConfig('donny-campaign-generate', 'essential');
    expect(c.model).toBe('claude-sonnet-4-6');
    expect(c.maxTokens).toBe(8192);
  });
  it('other functions still degrade to Haiku in essential (unchanged)', () => {
    expect(getModelConfig('donny-chat', 'essential').model).toBe('claude-haiku-4-5-20251001');
    expect(getModelConfig('donny-campaign-preview', 'essential').model).toBe('claude-haiku-4-5-20251001');
  });
  it('unknown function → Sonnet default', () => {
    expect(getModelConfig('nope', 'full_power').model).toBe('claude-sonnet-4-6');
  });
  it('campaign-generate action cost is the premium value', () => {
    expect(getActionCost('donny-campaign-generate')).toBe(8);
  });
});
```
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Edit `model-routing.ts`:**
  - Add after `SONNET_EXTENDED` (line ~36):
```ts
const OPUS_CREATIVE: ModelConfig = {
  model: "claude-opus-4-8",
  maxTokens: 8192,
  actionCost: 8,
  tier: "T3", // reuse T3 — donny_cost_ledger CHECK allows only T0-T3+embedding
};
```
  - Add `floor?: ModelConfig;` to `interface FunctionRouting` (line ~45-48).
  - Change the campaign-generate routing entry (line 55) to:
```ts
  "donny-campaign-generate": { config: OPUS_CREATIVE, canDowngrade: false, floor: SONNET_EXTENDED },
```
  - In `getModelConfig`, change the essential branch (line 73) from `if (usageStage === "essential") return HAIKU;` to:
```ts
  if (usageStage === "essential") return routing.floor ?? HAIKU;
```
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** — `git add supabase/functions/_shared/model-routing.ts supabase/functions/_shared/model-routing.test.ts && git commit -m "feat(model-routing): Opus creative tier for campaign gen + Sonnet floor (never Haiku@512)"`

---

## Task 7: Cost-ledger honesty — add the Opus rate

Without an exact-string rate, `logCost` silently falls back to Sonnet rates and the 15% kill-switch under-counts.

**Files:** Modify `supabase/functions/_shared/cost-ledger.ts:10-16`

- [ ] **Step 1:** Add to `MODEL_COSTS`:
```ts
  "claude-opus-4-8": { input: 0.000005, output: 0.000025 },
```
- [ ] **Step 2:** `npm run build`.
- [ ] **Step 3: Commit** — `git commit -am "feat(cost-ledger): add claude-opus-4-8 per-token rates (keep 15% cap accurate)"`

---

## Task 8: Chat unification — 3 concepts, bounded + parse-safe

**Files:** Modify `supabase/functions/donny-chat/index.ts`

- [ ] **Step 1:** Update the `generate_campaign` tool **description** (line 79) to signal multiple concepts:
```ts
    description: "Generate 3 diverse, AI-optimized campaign concepts (including one bold wildcard) from the user's goals and audience. Present all three concepts to the user, not just one.",
```
- [ ] **Step 2:** In the handler (lines ~1485-1497), replace the forwarded body so it lands on the **strong new-format path** with a bounded token budget. Replace the `body: JSON.stringify({ brief, target_audience, budget_range, user_id })` block with:
```ts
        body: JSON.stringify({
          source_type: "manual",
          manual_text: [
            args.brief,
            args.target_audience ? `Target audience: ${args.target_audience}` : "",
            args.budget_range ? `Budget: ${args.budget_range}` : "",
          ].filter(Boolean).join("\n"),
          role: null,
          user_id: userId,
          // Chat is a synchronous sub-fetch inside a streamed turn — bound the
          // generation so it stays well under the 150s idle limit and can't
          // truncate the 3-idea JSON. (server clamps to [512, 8192].)
          max_tokens: 4096,
        }),
```
  (Keep the surrounding `if (!callerAuth) throw ...`, the `fetch(... Authorization: callerAuth ...)`, the `!response.ok` guard, and `return { result: data }` exactly as they are.)
- [ ] **Step 3:** `npm run build`.
- [ ] **Step 4: Commit** — `git commit -am "feat(donny-chat): route generate_campaign to the strong 3-concept path (bounded)"`

**Note on latency/heartbeats (verify, no code change expected):** `runTurn` emits one `status` event before `executeTool` (line ~2209) but nothing during the sync sub-fetch. With `max_tokens: 4096` and no thinking, natural output is ~1500–2500 tokens → ~20–40s, comfortably under the 150s idle window. Confirm with the Task 9 harness latency numbers; only if a real run approaches the window, lower the chat `max_tokens` further.

---

## Task 9: Verification harness (before/after, eyeball + structural asserts)

**Files:** Create `scripts/campaign-quality-compare.ts` (mirrors `scripts/managed-agent-audit.ts` dotenv+SDK pattern; run via `npx tsx`).

- [ ] **Step 1:** Write the script: load `ANTHROPIC_API_KEY` from a dotenv file; define 4-5 fixtures (website blurb; manual-text-only local restaurant; photo-only; connected-platforms; no-platforms). For each, call Anthropic **twice** — OLD (`claude-sonnet-4-6` @ 4096, **keep `temperature: 0.8`** to mirror pre-change behavior, using the pre-change prompt recovered via `git show HEAD~:supabase/functions/donny-campaign-generate/index.ts`) vs NEW (`claude-opus-4-8` @ 8192, **no `temperature`** — Opus 400s on it — using `buildDonnyFirstSystemPrompt`, imported from `../supabase/functions/donny-campaign-generate/lib.ts` relative to `scripts/`). Print side-by-side: per idea `title` / one-line `description` / `campaign_type` / `is_wildcard`; per run: count of **distinct** campaign_types, output tokens, latency ms, est. $ (Opus $5/$25 per M). Read-only — never writes DB/ledger. Do **not** commit its output.
- [ ] **Step 2:** Add structural assertions (deterministic acceptance) to the NEW run: exactly one `is_wildcard === true`; `campaign_type` distinct across the 3; every `recommended_platforms` value in the six-enum set; `creative_concept` non-empty; ≥1 deliverable on a connected platform when platforms are supplied. Print PASS/FAIL per fixture. **Also assert the NEW run's natural output tokens are comfortably below the chat cap (4096)** — this is the concrete validation that Task 8's bounded chat budget fits three complete ideas without truncation. (If any fixture's natural output approaches 4096, the graceful handler is the existing path: a truncated `parseCampaignJson` throws → the chat tool returns a retryable error, never a silent bad campaign — spec §3.4(b).)
- [ ] **Step 3:** Run it (needs the key + network): `npx tsx scripts/campaign-quality-compare.ts`. Eyeball quality; confirm structural asserts pass, NEW output < 4096 tokens, and latency is well under 150s.
- [ ] **Step 4: Commit** — `git add scripts/campaign-quality-compare.ts && git commit -m "test(campaign): OLD-vs-NEW quality-compare harness"`

---

## Task 10: Deploy discipline + verification

Only `donny-campaign-generate` (behavior change) and `donny-chat` (forward change) need redeploying. The `getModelConfig` change is behavior-neutral for the other ~11 importers.

- [ ] **Step 1: Confirm Opus access.** Verify `claude-opus-4-8` works with the prod `ANTHROPIC_API_KEY` — the Task 9 harness NEW run (or a one-off curl) is the check. **Fallback if access is missing:** point `OPUS_CREATIVE.model` at `claude-sonnet-4-6` (still @ 8192; then `config === floor` and the tier is Sonnet-extended). Ship the prompt/token/unification wins now; re-point to Opus once access lands. (Cost-ledger already has the Sonnet rate.)
- [ ] **Step 2:** `npm run typecheck` + `npm run test` (floor regression guard, backtick guard, platform resilience all green — note pre-existing e2e file failures per project memory; trust "N passed, 0 failed") + `npm run build`.
- [ ] **Step 3: Re-fetch `origin/main`** and check for a Lovable collision on the touched files (`model-routing.ts`, `cost-ledger.ts`, both index.ts, `campaignCreatorValidation.ts`, `IdeaCard.tsx`).
- [ ] **Step 4:** Run the **`careful`** skill (edge-fn deploy). Blast radius: "deploy `donny-campaign-generate` + `donny-chat`; new Opus model tier + relaxed prompt + chat forward; bundles updated `_shared/model-routing.ts` + `cost-ledger.ts`."
- [ ] **Step 5:** Dispatch the **`edge-function-reviewer`** subagent on `donny-campaign-generate` and `donny-chat`. Resolve every ISSUE. Watch the **template-literal backtick** hazard and confirm **`verify_jwt=false`** is preserved on both (`list_edge_functions` is ground truth; `config.toml` shows `false` for both).
- [ ] **Step 6: Deploy** via the Supabase CLI (bundles `../_shared/*` from disk): `supabase functions deploy donny-campaign-generate --no-verify-jwt --project-ref zocahiffooqdybdhguqv` then the same for `donny-chat`. **Boot-check** the `[campaign-generate] Calling Anthropic: model=claude-opus-4-8, max_tokens=8192` log line on a real generation (proves the new `_shared` bundled).
- [ ] **Step 7:** **`codex-review`** (mandatory independent second review) before opening the PR; fix findings + re-run until clean.
- [ ] **Step 8:** Open the PR; merge → Vercel deploys the frontend.
- [ ] **Step 9: `verify-prod`** — generate a campaign in the builder AND ask Donny in chat ("make me a campaign for <a real business>"); confirm 3 strong concepts (with a wildcard + big-idea line) on both, both viewports, no console errors.
- [ ] **Step 10: Ledger check** — after the first real generation: query `donny_cost_ledger` for a row where `model='claude-opus-4-8'` and `edge_function='donny-campaign-generate'`, and confirm `estimated_cost_usd ≈ input_tokens*0.000005 + output_tokens*0.000025` (recompute against the Opus rates — do **not** rely on the `fallback` flag, which is a separate always-false column and would pass even if `MODEL_COSTS` silently fell back to Sonnet rates). This proves Task 7's rate entry is live.
- [ ] **Step 11: `knowledge-sync`** on branch finish (wiki session source → ingest → refresh core docs → Donny RAG).

---

## Rollback

Pure, reversible. Revert the branch or, for a hot fix, re-point `OPUS_CREATIVE.model` to `claude-sonnet-4-6` and redeploy `donny-campaign-generate` — the prompt/schema/unification improvements stand on their own without the model change.
