# Design — Living Synthetic Marketplace (Sub-project A)

- Date: 2026-07-25
- Status: design (spec) — implementation follows via `writing-plans`
- Parent: extends [[Synthetic Weight Engine]] (Phase 0 spine, Phase 1 crew behavior engine, Phase A load economics, the runner matrix Slice 1)
- Related memory: [[project_synthetic_load_matrix_progress]], [[project_synthetic_weight_task8_teardown_fix]], [[project_cgc_anonymous_submission_constraints]], [[project_brand_logo_three_stores]]

## 1. Goal & scope

Stand up a **persistent, browsable, "alive" synthetic marketplace on prod** so the app *feels populated* from
both the business and creator sides — real profiles, published **free** campaigns, applications → collaborations,
content deliverables, DragonFeed posts, messaging threads, discounts/promotions (incl. **CGC**), reviews, and
**multi-location businesses**. Visible to everyone (founder-accepted), yet excluded from founder metrics + the
data-flywheel moat via the existing `is_synthetic` segregation.

This is **Sub-project A** of a 3-part initiative. Deliberately **out of scope here**:
- **Sub-project B — synthetic Stripe TEST transactions** (bot Connect accounts + escrow-funded PAID campaigns +
  checkout→escrow→payout). A leaves clean seams — real free collaborations B upgrades to paid — and no money flow
  touches A.
- **Sub-project C — 200K-DAU load proof** (raise `MAX_SHARDS`, more runner IPs). Fully independent — the ephemeral
  load matrix, not this persistent cohort.

**Success criteria.** A founder (or any user) browsing prod sees a dense, realistic marketplace from both roles;
founder metrics (`aios_*`, `platform_weight.*_real`) are **byte-identical** to before (segregation holds, re-proven
on the NEW surfaces this adds); the cohort is capped + prunable (no unbounded growth); a scoped teardown proves to
zero sparing the other two cohorts.

## 2. Foundational decisions (from brainstorming + spec review)

| Decision | Choice |
|----------|--------|
| Aliveness | **Ongoing live activity is the goal, phased**: (A1) rich static populate → (A2) live tick on top of it. |
| Scale | **~100 businesses / ~300 creators** (~400 persistent synthetic users). |
| Create-path | **Approach 2 — real RLS-enforced app flows** (bot JWTs), SQL only for inert profile bulk. |
| Text realism | **Hybrid** — curated pools for the bulk; LLM (existing generation path, `donny_cost_ledger`-metered) only for showcase text (campaign briefs, a few threads). |
| Visibility | **Prod, visible to everyone** — no visibility gate; segregation keeps it out of metrics only. |
| **Campaign money model** | **Standard campaigns are FREE (`fixed_price=0`) in A** — they complete through the crew-style no-escrow/no-payout path (Phase 1's free-rails). **PAID campaigns + real escrow/payout are Sub-project B.** (Optional browse-realism: a few paid-but-unfunded campaigns that sit "open with applicants" and never hire — but the default is all-free so the full lifecycle populates.) |
| **Real↔synthetic interaction** | **Inert-by-design (recommended — FOUNDER TO CONFIRM at §4a):** bots act only on their own cohort graph; a real user CAN see/apply/message a bot campaign or creator, but bots never respond and the existing money guard blocks any real settlement. Alternative (more build): a real→bot interaction guard. |
| Multi-location | ~25–30 of the businesses are **multi-location orgs** (2–4 `org_units`) — **additive follow-on** after the core populate. |
| CGC | **A promotions-subsystem feature, NOT a `campaigns` type** — `promotions` / `promotion_submissions` / `business_profiles.cgc_posting_preferences`, anonymous QR submissions. **Additive follow-on**; not counted in the campaign total. |

## 3. Cohort & segregation

- A **new persistent cohort** distinct from the two existing ones: the live crew-lane daily cohort (`bot0##`, N=25)
  and the ephemeral load cohort (`botla`/`botseed`). New namespace: **`botmk_<role>_<i>@synthetic.dragoncandy.test`**
  (`mk` = marketplace) — ~100 business + ~300 creator bots.
- **Segregation is inherited, not rebuilt:** every `@synthetic.dragoncandy.test` address is auto-tagged in
  `synthetic_users` by `handle_new_user` → `is_synthetic()` true. Verified: the founder-metric surfaces this adds
  already exclude synthetic — `promotions` (`WHERE NOT is_synthetic(user_id)`), multi-location `org_units`
  (`WHERE NOT is_synthetic_org(org_id)`), `business_profiles` restaurants/brands. Browsable in-app, invisible to
  metrics/moat.
- **Kill switch:** `SYNTHETIC_BOTS_ENABLED` gates the populate **and** the tick (fail-closed at boot via `sim/env.ts`).
- **Teardown:** a new **`botmk%`-scoped** purge RPC (leaf-first, residue-reported, same pattern as
  `purge_synthetic_load_cohort`). Its leaf-delete set (messaging/reviews/promotions/`promotion_submissions`/
  `campaign_media`/`file_uploads` FKs) is **discovered by a rollback-wrapped run, not reasoned** (the Phase-0/A
  lesson). Persistent by design → deliberate-removal only.
- **Cross-cohort footgun (carry the runbook warning):** the generic `purge` subcommand calls `purge_synthetic_data()`,
  which matches ALL `%@synthetic.dragoncandy.test` — it now wipes a THIRD cohort (`botmk`) **plus the live `bot0##` 25**.
  Routine resets MUST use the scoped `botmk` purge; never the full purge.
- **AI cost:** LLM showcase-text calls meter through `donny_cost_ledger` under the ≤15%-of-revenue cap.

## 4. Phase A1 — the populate (through real flows)

A new harness command `sim/cli.ts marketplace-seed` runs a **serial batch of real, RLS-enforced actions** (serial →
the mint-429 never bites). Idempotent/resumable. SQL only for inert profile fields where a real flow adds no fidelity.
Sequenced **core first**, then the two least-understood items (multi-location, CGC) as additive follow-ons.

**Core populate:**
1. **Mint** ~400 `botmk` bots (100 business / 300 creator) with curated realistic profiles.
2. **Businesses set up** `business_profiles` + organization + curated **discounts**.
3. **Publish FREE campaigns** (~1–3 per business → ~150–300, `fixed_price=0`), curated structure + LLM briefs.
4. **Applications → collaborations:** creators apply via real `apply_to_campaign`; businesses hire (real accept).
   Because campaigns are free, hire needs no escrow and activates directly (crew-style path).
5. **Content delivery:** creators upload real deliverable files into DragonCandy's **own** storage buckets (curated
   sample assets) and submit through the content state machine. *Bonus:* real DragonCandy-hosted media — the working
   egress source Sub-project C's `SAMPLE_MEDIA_URLS` was missing.
6. **Completion + reviews:** free campaigns complete via the **crew-style no-payout path** (the real completion edge
   function invokes payout for non-crew paid campaigns — A must skip that leg, exactly as Phase 1 does for free crew
   campaigns); completed collaborations produce real mutual reviews.
7. **Messaging:** real threads between matched business/creator pairs through the real messaging path (+ realtime).
8. **DragonFeed:** creators post real DragonShare posts.

**Additive follow-ons (de-risked, verify-first):**
9. **Multi-location:** promote ~25–30 businesses to multi-location orgs (2–4 `org_units`, `org_members` seats);
   scope some campaigns/discounts/content/conversations to a unit via the `*_org_unit` columns.
10. **CGC (promotions path):** create CGC **promotions** (`promotions` + `cgc_posting_preferences`) and populate
    anonymous **`promotion_submissions`** via the real anon-submission storage/RLS path.

### 4a. Real↔synthetic interaction policy (FOUNDER DECISION)

A drops Phase 1's structural bot↔bot isolation (crews were private) and makes the cohort publicly interactive.
**Recommended default — inert-by-design:** the tick + populate drive bot actions ONLY within the `botmk` cohort
graph; a real user may see and act on bot campaigns/creators (visibility was chosen), but bots never respond and the
money guard blocks any real settlement — a real→bot application/message simply dead-ends. The cost is a minor UX
wart (a real user could apply to a bot campaign and get no reply). **Alternative (more build):** a real→bot guard
that keeps bot campaigns visible but non-applyable/non-messageable by real users. Confirm which at spec review.

## 5. Phase A2 — the live tick + growth guard

- Extend the existing daily-tick to drive a **small delta of new activity each run**: fresh messages on existing
  threads, a few new applications, an occasional new free campaign, new DragonFeed posts, reviews on newly-completed
  collaborations. Reuses the tick infra already live at N=25.
- **Growth guard (mandatory for "ongoing on prod"):**
  - **Cohort** capped at ~400 (no runaway minting); **campaigns capped per business**.
  - **Messages + DragonFeed posts:** rolling retention window (prune older than N days).
  - **Deliverable `file_uploads` / content:** intentionally RETAINED (they feed Sub-project C's media source), but
    bounded — capped per completed collaboration and by the capped campaign count, so accumulation is finite.
  - **Completed campaigns / collaborations / reviews:** bounded by the per-business campaign cap (not monotonic).
  - The kill switch **halts new activity instantly** (it gates the tick; it does not purge the persistent cohort — removal is the deliberate scoped teardown of §3).
  - *(Plan-time details: at-cap behavior — stop vs recycle old campaigns — and whether every business gets an `organizations` row or only the multi-location ones, are pinned down in the implementation plan.)*

## 6. Text seam (hybrid)

- **Curated pools** as TS arrays: realistic business names, creator handles/bios, discount kinds, message snippets,
  review phrasings, campaign types. Deterministic, zero AI cost, varied enough to read real at a glance.
- **LLM seam** only for showcase text (campaign briefs, a few threads), reusing the existing campaign-generation
  path; metered via `donny_cost_ledger`, respecting the 15% cap.

## 7. Testing & proof

- **TDD the harness logic offline** with injected deps (populate sequencer, tick delta, curated-pool selection,
  growth guard) — same style as the existing `sim/` tests.
- Real-flow actions exercise the **real RPCs** (apply/hire/upload/submit/message/review) — RLS-real.
- **Prove segregation** rollback-wrapped on prod: founder `aios_*` + `platform_weight.*_real` **byte-identical**
  before/after, and the proof MUST explicitly cover the NEW surfaces (`promotions`, multi-location `org_units`,
  CGC `promotion_submissions`, `business_profiles`) so any uncounted surface fails the proof rather than leaking silently.
- **Prove teardown-to-zero** for the `botmk` scoped purge (residuals all 0, other two cohorts intact), ONE statement
  per MCP call.

## 8. Verify-first / open items (resolve during implementation, do NOT fabricate)

- **CGC = promotions subsystem** (confirmed by the spec-reviewer against `docs/superpowers/specs/2026-05-26-cgc-campaigns-optimization-design.md`
  + `20260527100002_cgc_posting_preferences.sql`): `promotions` / `promotion_submissions` / `business_profiles.cgc_posting_preferences`,
  anonymous QR submissions. Verify the exact tables/RLS before seeding; it is NOT a `campaigns.type`.
- **Free-campaign completion without payout** — confirm the exact crew-style path `sim/behavior/actions.ts` uses to
  skip the payout invoke for free campaigns, and that `accept_application_with_collaboration` activates a free
  (escrow-not-required) campaign.
- **Multi-location** — `organizations`/`org_units`/`org_members` seats + `*_org_unit` scoping columns + the
  team-account/logo-sync triggers ([[project_brand_logo_three_stores]]).
- **Content-delivery state machine** — the real upload→submit→approve path + storage bucket RLS for bot uploads.
- **Messaging** — the real create-conversation / send-message RPCs + realtime publication.
- **Inert-SQL vs flow** — which profile fields are safe as direct SQL vs must go through a flow (diff CURRENT prod
  trigger definitions, per the Phase-0 lesson — avoid `CREATE OR REPLACE` drift).

## 9. Out of scope (explicit)

Stripe transactions + PAID campaigns (Sub-project B), the 200K load ramp (Sub-project C), a founder-only visibility
gate (rejected — prod-visible-to-all was chosen), and any change to the live crew (`bot0##`) or load (`botla`/`botseed`)
cohorts.
