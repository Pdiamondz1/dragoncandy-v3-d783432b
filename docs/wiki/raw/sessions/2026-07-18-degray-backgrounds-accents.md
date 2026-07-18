# Session — De-gray backgrounds + off-brand accents cleanup (2026-07-18)

**PR:** #289 (merged + deployed). Branch `feat/degray-backgrounds-accents`. Frontend-only; no
schema/edge-fn/secret change. A targeted cross-app cleanup after the four surface-group phases
([[Light-App Kit]], Phases 1–4) — prioritizing the **two highest-visual-impact categories** the
"surfaces/badges only" rollout deliberately left: **gray panel BACKGROUNDS** and **OFF-BRAND ACCENTS**.

## Why this pass (founder directive)
The phased polish rule was "de-gray surfaces/badges, keep gray TEXT" and each phase worked per-surface,
so panel-level gray fills and scattered off-brand (blue/purple/indigo) accents remained in surfaces the
phases had already "polished." The founder asked to **prioritize backgrounds and off-brand accents
first** — the biggest visual wins.

## The audit keystone: no full-page washes remain — it's all panel-level
A read-only cross-app audit found **every page is already white** (`bg-background`); the remaining work
was **panel/card/chip-level gray fills** (`bg-muted`/`bg-gray-*`) + generic off-brand accents,
concentrated in the campaign builder, application/matching cards, messaging sub-panels, and consumer
Donny chat. The single most prominent off-brand item: two **blue/indigo "sponsorship" info cards**
(`from-blue-50 to-indigo-50`).

## Executed as 4 reviewed sub-batches (55 files, all presentational)
1. **Campaign builder + the keystone sponsorship cards** — `bg-muted`/`bg-gray-*` panels →
   `bg-dc-teal/[0.04]` inset; the blue/indigo sponsorship cards (`CampaignSponsorshipToggle` +
   `CampaignFinalizeStep`) → teal card with a pink dollar-icon accent (both matched); blue focus rings →
   `focus:ring-dc-teal`; `bg-gray-900` step badge/submit button → teal.
2. **Applications / matching / campaign-details** — the repeated `bg-muted` note-panel pattern → inset;
   blue/purple/decorative-orange icons → teal/pink; the blue "Submitted" badge → `AppStatusBadge tone="teal"`.
3. **Messaging sub-panels + brand-browse/campaigns** — thread header, list search/rows, reaction hovers,
   brand chips → the kit (the **pink/teal conversation bubbles untouched** — only neutral system/meta
   chrome changed).
4. **Consumer Donny chat + files/projects + modals + upload dropzone** — inputs/panels de-grayed; the
   blue file-upload dropzone → teal (unifying with `MediaUploader`'s already-teal dropzone); blue/purple
   modal icons → teal/pink.

## Durable rules reinforced
- **De-gray palette extends to `bg-muted`** — `bg-muted`/`bg-muted/NN` panel fills (a semantic shadcn
  token that is a near-white *warm gray* in light mode) → `bg-dc-teal/[0.04]` inset. But **`bg-muted`
  inside `src/components/ui/*` shadcn primitives stays** (shared with dark surfaces).
- **A translucent inset tint (`bg-dc-teal/[0.04]`) is calibrated for a WHITE surface** — layered over a
  colored bubble it vanishes. The inbound message-attachment sub-box (on the pink bubble) needed a
  translucent-white overlay (`bg-white/40`) that reads on pink, mirroring the outbound side's
  `bg-white/15` on the teal bubble. (A whole-branch-review catch.)
- **Dark-circle send/add buttons are an intentional design-system pattern** (`DESIGN_SYSTEM.md`), so
  `DonnyChatInput`'s `bg-gray-900` round send/attach buttons are a KEEP — only the chat input field was
  de-grayed.
- **Distinguish a decorative off-brand color from a semantic one** — a decorative `text-orange-500`
  palette icon → pink, but an `orange`/`yellow` counter-offer/rush WARNING is a semantic keep.
- **Unify inconsistent conventions** — two drag-active dropzone styles existed (`border-teal-400 bg-teal-50`
  correct vs `border-blue-500 bg-blue-50`); standardized on teal.
- The usual keeps held: chart data-viz, semantic amber/red/emerald/green-success, money-flow, media
  letterboxes/backings, gray TEXT.

## Process / verification
Cross-app audit → founder scope call (app surfaces = Buckets 1+2; skip excluded public/marketing + the
low-value skeleton-pulse sweep) → subagent-driven (1 implementer per batch). Batch 1 (the keystone
sponsorship cards) individually reviewed **APPROVED**; batches 2–4 folded into a whole-branch review
(**READY TO MERGE**). **Codex second review clean**. `npm run build` + typecheck green; **983/983 tests**;
full residual sweep across all 55 files = **zero unjustified gray-background/off-brand accent** (only
media backings + dark-circle buttons remain, as intended). Review-caught legibility fixes folded in
(teal sidebar heading, AA photo badge, the inbound-attachment box on the pink bubble, two leftover
borders). Deploy verified (bundle live; authenticated surfaces founder-verify-only).

## Deferred (out of scope, documented)
The previously-excluded **public/marketing** surfaces (Pricing, Help, the public promotion funnel,
`StripeTestHelper`) and the near-invisible **skeleton-pulse** `bg-muted` loading placeholders — low
return; easy separate follow-up if ever wanted.

## With this, the entire light app is on-brand
Not just cards and badges (Phases 1–4) but every panel background and accent color. See [[Light-App Kit]].
