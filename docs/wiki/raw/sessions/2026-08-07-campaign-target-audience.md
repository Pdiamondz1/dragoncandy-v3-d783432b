# Session: campaign target audience replaces creator personas (2026-08-07)

Branch: `feat/campaign-target-audience` (off `origin/main` @ d71a0db6). Commit `cdf429ae`.
Status at write time: committed, **not merged**, edge function **not deployed**, Codex second
review **not run** (OpenAI quota exhausted until 2026-08-08 08:55).

## What prompted it

The founder screenshotted the campaign builder's "Logistics & Targeting" section and said the
TARGET CREATORS chips "have to be more specific — we have to target audiences… make it very
obvious that we want the content to attract that customer type instead of a bunch of options,"
plus "provide what other tags the campaign can have; maybe Donny can recommend."

## What the audit found (the case for deleting rather than tuning)

1. **The chips fed nothing.** `PERSONA_OPTIONS` (`Foodie, Lifestyle, Fitness, Beauty, Tech,
   Travel, Fashion, Parenting, Gaming, Comedy`) wrote to `ai_analysis.target_creator_persona`
   and was read by exactly three display components. Creator matching scores
   `creator_profiles.skills` — a **craft** enum (`photography`, `video_editing`) — browse filters
   use skills, notifications ignore personas. The two taxonomies share **zero** values and nothing
   joins them. Blast radius of removal: three badge renders, two chip editors.
2. **Chips and generator already contradicted each other.** The prompt asked for
   `target_creator_persona` with **no enumerated vocabulary**, while `campaign_type`, `platforms`,
   `content_type`, `aspect_ratio` and `tier` were all constrained. So Donny emitted things like
   `"Gen Z brunch crowd"` → zero chips lit, value invisible in the UI, still persisted.
3. **Three duplicated copies**, three encodings (`CampaignEditor.tsx`, `CampaignEditPage.tsx`,
   `useBrandCampaignWizard.ts`), agreeing only by coincidence; storage type `string[]` everywhere
   so drift was silent.

## Decisions

| # | Decision |
|---|---|
| 1 | **Replace**, not augment. Personas removed from create + edit flows. |
| 2 | Audience = **one Donny-written editable line** + **2 alternates as one-tap swaps**. Not a chip grid. |
| 3 | **Campaign tags** = 4–6 creative-direction cues (vibe/moment/prop/light) for the creator's brief. No matching, no discovery filter — deliberately display-only. |
| 4 | Audience → **Campaign Overview** (it's the campaign's thesis); tags → **Content Requirements** (next to style direction); each **idea card** shows its audience so you pick between customers at selection time. |
| 5 | **No re-derivation** on edit — it's just text. The existing RegenerateButton covers a full redo. |
| 6 | **No migration.** Everything rides in `ai_analysis`, matching how this flow already works. |
| 7 | Audience **not required at launch** — Donny always fills it; empty shows placeholder copy. |
| 8 | Brand wizard **out of scope** (`BRAND_ROLE_ENABLED` is false). |

## Implementation

- **New** `src/lib/campaignAudience.ts` — `normalizeAudienceLine`, `normalizeCampaignTags`,
  `audienceSwapOptions`, `MAX_CAMPAIGN_TAGS=8`, `MAX_AUDIENCE_CHARS=160`.
- **New components** `TargetAudienceField.tsx`, `CampaignTagsField.tsx`; `EditableField` gained a
  `placeholder` prop.
- `CampaignIdea` gains `target_audience` / `audience_alternates` / `campaign_tags`;
  `EditableCampaign` gains the first and third (**not** alternates — swapping is meaningless once
  live, and omitting it drops a field from four places).
- Prompt: new `audienceGuidance()` in `donny-campaign-generate/lib.ts`; **`target_audience` is
  emitted BEFORE `style_direction`/`key_messages`/`hashtags`** in the JSON schema block.
- Surfaces: `IdeaCard`, `CampaignPreviewCard`, `CampaignOverviewSection`,
  `ContentRequirementsSection`, `CampaignDetailModal`, `BrandCampaignDetails`.
- `BrandCampaignDetails.tsx` heading renamed "Target Audience" → "Target Creators" (it renders
  personas; the label was already wrong and became actively confusing).

## Gotchas discovered

- **The localStorage draft path never sees Zod.** `loadDraftFromStorage` is a bare `JSON.parse`
  with a cast, pushed straight into state — so a pre-change draft would reach the editor with
  `campaign_tags` undefined and throw on `.map`. Invisible in dev (empty localStorage). Fixed with
  an exported `normalizeDraft`. **There are exactly two coercion boundaries: Zod (network) and
  `normalizeDraft` (storage).**
- **`lib.test.ts` constrains the prompt's vocabulary**: it asserts the prompt does NOT match
  `/\bMUST\b/`, `/\bONLY\b/`, `/Do NOT suggest/i`, contains no `linkedin|pinterest|snapchat|x.com`,
  and has no backtick. New guidance must use lowercase imperatives.
- **`cn` became an unused import** in `CampaignEditor.tsx` once the persona block went —
  `noUnusedLocals` fails the build.
- **Deploy order is the reverse of the intuitive one** (see below).
- **`codex review --base main` silently reviews NOTHING when work is staged-but-uncommitted** —
  `git diff main...HEAD` is empty because HEAD == main's tip. Use `--uncommitted`, or commit first.
  A returned "clean" would have been false assurance.

## Review findings that changed the code

- **Two agents independently**: the edit-page write path bypassed the coercion rules this change
  introduced (`ChipListEditor` dedupes case-**sensitively**, no cap) → `Candlelit` + `candlelit`
  both stored → **duplicate React keys** at three render sites keyed on the tag value.
- **Self-contradiction (P2)**: `campaignAudience.ts` says "write short, read tolerant — truncating
  an existing campaign's audience would be a silent edit," then the edit-form save called
  `normalizeAudienceLine` (slice to 160). Editing a *title* would have truncated a legacy prose
  audience mid-word. Now trims only; new typing bounded by `maxLength` on the input.
- **A test that could never fail**: the schema-ordering assertion used
  `indexOf('"target_audience"')`, which matched the quoted mention in the prompt's **prose** —
  ahead of the schema regardless of field order. Now scoped to the schema block.
- **Miscited justification**: comments credited `useAnonymousCampaignWizard.ts` as the legacy
  free-text writer of `ai_analysis.target_audience`. It never touches the campaigns table.
  The real writer is `useCampaignWizard.ts:156` (stores the whole `generate-campaign-analysis`
  blob, whose `target_audience` is prose). Corrected in four places — a maintainer checking a bad
  citation might "correct away" a tolerance that is load-bearing.
- **Verified, not assumed**: `z.unknown().transform(fn)` was tested against the installed zod
  (3.25.76) — a **missing** key still runs the transform and the result is written as an own
  property. That was the highest-risk item and it holds.

## Deploy ordering (load-bearing, and the reverse of the first instinct)

`push to main` deploys the **frontend only**; edge functions deploy separately.

| Window | Behavior |
|---|---|
| New function + old frontend | The **deployed** `campaignIdeaSchema` has `target_creator_persona` **required** → parse throws → "Generation failed" on **every** generation. Unacceptable. |
| New frontend + old function | `.catch()`/transform absorb the missing keys. Audience renders empty with a placeholder. Degraded, not broken. |

**So: frontend first, edge function second.** The function ships a transitional
`'      "target_creator_persona": [],\n'` line — an empty array satisfies the old required schema
(verified: `git show origin/main:...` shows plain `z.array(z.string())`, **no `.min()`**), so
stale browser tabs keep working. `useAppVersion` only *nags* on a new version, never force-reloads,
so a user can sit on an old bundle for hours. Remove the line in a follow-up deploy ~a week later;
`lib.test.ts` pins an assertion to it so it can't be forgotten silently.

## Verification

typecheck exit 0 · lint exit 0 · `npm run build` ✓ · 39/39 on touched tests · 1859/1859 full suite
· `edge-function-reviewer` **PASS**. **Codex second review NOT RUN** — quota exhausted.

## Open / next

- Run Codex before opening the PR (quota resets 2026-08-08 08:55).
- Merge frontend → then deploy `donny-campaign-generate` → then verify on prod that all three ideas
  carry *distinct*, specific audiences (not "Foodies").
- Follow-up deploy to drop the transitional `target_creator_persona: []`.
- **The honest test of this feature is whether a creator submits better content having read the
  audience line** — not whether the screen looks better. Tags feed nothing by design, which is the
  same shape as the failure this change deleted.
