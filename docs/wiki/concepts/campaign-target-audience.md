---
title: Campaign Target Audience
type: concept
created: 2026-08-07
updated: 2026-08-07
sources: [2026-08-07-campaign-target-audience]
tags: [campaign-generation, donny, targeting, prompt-engineering, backward-compatibility]
---
# Campaign Target Audience

What a campaign is aimed at — the **customer the content should attract** — and the 2026-08-07
change that replaced a decorative "target creator personas" chip grid with a Donny-generated
audience line plus creative-direction tags. Concerns the campaign builder
(`src/components/campaign-creator/`) and the `donny-campaign-generate` prompt. See
[[Campaign Generation Creativity]] for how that prompt makes ideas *good*; this page is about
what they're *for*.

## Key Decisions

### The question was wrong, so the field was deleted rather than tuned
"Target Creators" asked a business which **kind of creator to hire**. A restaurant owner cares
who walks through the door. Three findings made deletion the right call over a better chip list:

- **The chips fed nothing.** They wrote to `ai_analysis.target_creator_persona` and were read by
  three display components. [[AI Creator Matching]] scores `creator_profiles.skills` — a *craft*
  enum (`photography`, `video_editing`) — browse filters use skills, notifications ignore personas.
  The two taxonomies share **zero** values and nothing joins them.
- **The chips and the generator already contradicted each other.** The prompt asked for
  `target_creator_persona` with **no enumerated vocabulary** while every other creative field was
  constrained, so Donny emitted values like `"Gen Z brunch crowd"` that lit up no chip, vanished
  from the UI, and still persisted.
- **The list was duplicated three times** in three encodings, agreeing only by coincidence.

### Shape: one specific line, not a menu
Donny writes **one** audience — *"Date-night couples, 25–40, who live within 5 miles of Washington
St"* — pre-filled from the business context he already extracted, editable, with **two alternates
as one-tap swaps**. The swap set is `[primary, ...alternates]` minus the current value, so swapping
back falls out for free with no extra state. Zero keystrokes to accept, one tap to change — the
[[Less Typing = More Margin]] test.

`audience_alternates` lives on `CampaignIdea` **only** — not on `EditableCampaign`, not in
`ai_analysis`. Once a campaign is live, "swap to an alternate" is meaningless, and omitting it
removes a field from four places.

### Placement makes the point
Audience sits in **Campaign Overview** under the tagline — it is the campaign's thesis, not a
logistics detail — and **every idea card shows its audience**, so the choice between Donny's three
ideas is a choice between *customers* rather than between titles. Tags sit in **Content
Requirements** beside style direction, key messages and hashtags: the block a creator actually
reads before shooting. Logistics & Targeting shrinks to what it really is — timing and geography.

### Schema field order is the mechanism, not the instruction
In the prompt, `target_audience` is emitted **before** `style_direction`, `key_messages` and
`hashtags`. The model is autoregressive, so ordering is what actually makes the creative fields
derive from the audience; merely *telling* it to derive them does far less. `lib.test.ts` pins
this ordering — scoped to the schema block, because searching the whole prompt matches the quoted
mention in the prose guidance and passes regardless of order.

### Exactly two coercion boundaries
`src/lib/campaignAudience.ts` owns the rules (trim, lowercase, dedupe, cap). It is applied at
**Zod** (`z.unknown().transform(...)`, for generation results) and at **`normalizeDraft`** (for
localStorage drafts). Those are the only two ways an idea reaches state — verified by enumerating
every writer of `campaignIdeas` / `editedCampaign` — so nothing downstream re-coerces.

**Write short, read tolerant.** `MAX_AUDIENCE_CHARS` is 160, not the 120 the prompt asks for,
because the legacy campaign wizard stores its whole `generate-campaign-analysis` result as
`ai_analysis` and that function asks the model for a free-text `target_audience` — prose, not a
line. The clamp therefore applies at the **generation boundary only**; the edit form trims but
never slices, and bounds new typing with `maxLength` instead. Slicing on a round-trip would
silently truncate an existing campaign's audience when someone edits an unrelated field.

### No migration, and legacy data sunsets on its own
Everything rides in `ai_analysis` (there is no `campaigns.target_audience` or `campaign_tags`
column, and `campaigns.target_creator_personas` from migration `20260406100000` appears to be
unapplied — which is why `hydrateCampaignFromAnalysis` has a column→JSONB fallback chain at all).
The legacy persona render blocks are **untouched** and guarded on `length > 0`, so old campaigns
keep showing personas and new ones simply never set them. `...existingAnalysis` in the edit-save
spread preserves them through an edit.

### Tags are display-only on purpose — and that is the risk
Tags feed no matching and no discovery filter. Correct pre-liquidity: there aren't enough campaigns
for tag-filtering to matter, and a creator-side niche taxonomy doesn't exist (only the craft enum).
But it is the **same shape as the failure this change deleted** — the personas were worthless
*because nothing read them*. The honest test is whether a creator submits better content having
read the audience line, not whether the screen looks better.

## Known Issues

- **Codex second review was not run** on the shipping commit (`cdf429ae`) — OpenAI quota exhausted
  until 2026-08-08. Required by `CLAUDE.md` before opening the PR.
- **Deploy order is load-bearing and counter-intuitive**: **frontend first, edge function second.**
  The *deployed* `campaignIdeaSchema` has `target_creator_persona` **required**, so shipping the
  function first throws on every generation for anyone on the current bundle. The function carries
  a transitional `"target_creator_persona": []` (an empty array satisfies the old schema — verified
  it has no `.min()`) to protect stale tabs, since `useAppVersion` only nags and never force-reloads.
  A follow-up deploy drops that line; a `lib.test.ts` assertion is pinned to it so it cannot be
  forgotten silently.
- The `?brief=` / `pendingBrief` landing handoff still passes audience only as free text inside the
  prompt, never as a structured field.
- Three private chip-list editors now exist (`CampaignTagsField`, `CampaignEditPage`'s
  `ChipListEditor`, `BrandGuidelinesEditor`'s `TagInput`). Deliberately not unified — the two pages
  use different visual languages — but a shared `app/` primitive is the eventual fix.

## Gotchas

- **The localStorage draft path never sees Zod.** `loadDraftFromStorage` is a bare `JSON.parse`
  with a cast, pushed straight into state, so a pre-change draft reaches the editor with
  `campaign_tags` undefined and throws on `.map`. **Invisible in dev** (empty localStorage). Any
  new required field on `CampaignIdea`/`EditableCampaign` must be back-filled in `normalizeDraft`.
- **`lib.test.ts` constrains the prompt's vocabulary**: no `/\bMUST\b/`, no `/\bONLY\b/`, no
  `/Do NOT suggest/i`, no `linkedin|pinterest|snapchat|x.com`, no backtick. Use lowercase
  imperatives in new guidance.
- **`codex review --base main` reviews NOTHING when work is staged-but-uncommitted** — HEAD equals
  main's tip, so `git diff main...HEAD` is empty. Use `--uncommitted`, or commit first. A returned
  "clean" verdict would be false assurance. See [[Codex Second Review]].
- Removing a field from `EditableCampaign` is a useful safety net: `noUnusedLocals` + strict mode
  surface every consumer. If it compiles clean immediately, suspect a `string[]`-typed consumer
  was missed.

## See Also

- [[Campaign Generation Creativity]] — the same prompt, from the "are the ideas any good" angle
- [[AI Creator Matching]] — what actually matches creators (skills, not personas)
- [[Campaign Price Anchoring]] — the sibling "the generated value reads as a demand" problem
- [[Delivery Tier Selection]] — the sibling "one control, two fields" cleanup in the same section
- [[Content Delivery State Machine]] — what happens after a campaign is launched
