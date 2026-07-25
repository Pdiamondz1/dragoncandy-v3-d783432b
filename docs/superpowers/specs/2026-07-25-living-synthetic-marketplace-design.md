# Design — Living Synthetic Marketplace (Sub-project A)

- Date: 2026-07-25
- Status: design (spec) — implementation follows via `writing-plans`
- Parent: extends [[Synthetic Weight Engine]] (Phase 0 spine, Phase 1 crew behavior engine, Phase A load economics, the runner matrix Slice 1)
- Related memory: [[project_synthetic_load_matrix_progress]], [[project_synthetic_weight_task8_teardown_fix]], [[project_cgc_anonymous_submission_constraints]], [[project_brand_logo_three_stores]]

## 1. Goal & scope

Stand up a **persistent, browsable, "alive" synthetic marketplace on prod** so the app *feels populated* from
both the business and creator sides — real profiles, published campaigns (standard **and CGC**), applications →
collaborations, content deliverables, DragonFeed posts, messaging threads, discounts/promotions, reviews, and
**multi-location businesses**. Visible to everyone (founder-accepted), yet excluded from founder metrics + the
data-flywheel moat via the existing `is_synthetic` segregation.

This is **Sub-project A** of a 3-part initiative. Deliberately **out of scope here**:
- **Sub-project B — synthetic Stripe TEST transactions** (bot Connect accounts + checkout→escrow→payout). A
  leaves clean seams (real collaborations) for B to attach payments to; no money flow in A.
- **Sub-project C — 200K-DAU load proof** (raise `MAX_SHARDS`, more runner IPs). Fully independent — that is the
  ephemeral load matrix, not this persistent cohort.

**Success criteria.** A founder (or any user) browsing prod sees a dense, realistic marketplace from both roles;
founder metrics (`aios_*`, `platform_weight.*_real`) are **byte-identical** to before (segregation holds); the
cohort is capped + prunable (no unbounded growth); a scoped teardown proves to zero sparing the other two cohorts.

## 2. Foundational decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Aliveness | **Ongoing live activity is the goal, phased**: (A1) rich static populate → (A2) live tick on top of it. |
| Scale | **~100 businesses / ~300 creators** (~400 persistent synthetic users). |
| Create-path | **Approach 2 — real RLS-enforced app flows** (bot JWTs), SQL only for inert profile bulk. |
| Text realism | **Hybrid** — curated pools for the bulk; LLM (existing generation path, `donny_cost_ledger`-metered) only for showcase text (campaign briefs, a few threads). |
| Visibility | **Prod, visible to everyone** — no visibility gate; segregation keeps it out of metrics only. |
| Multi-location | ~25–30 of the businesses are **multi-location orgs** (2–4 `org_units`). |
| Campaign types | **Standard creator campaigns + CGC** (consumer-generated-content, anonymous submissions). |

## 3. Cohort & segregation

- A **new persistent cohort** distinct from the two existing ones: the live crew-lane daily cohort (`bot0##`, N=25)
  and the ephemeral load cohort (`botla`/`botseed`). New namespace: **`botmk_<role>_<i>@synthetic.dragoncandy.test`**
  (`mk` = marketplace) — ~100 business + ~300 creator bots.
- **Segregation is inherited, not rebuilt:** every `@synthetic.dragoncandy.test` address is auto-tagged in
  `synthetic_users` by `handle_new_user` → `is_synthetic()` true → the existing two-sided actor-OR-parent exclusion
  keeps the cohort out of `aios_*` + `platform_weight.*_real`. Browsable in-app, invisible to metrics/moat.
- **Kill switch:** `SYNTHETIC_BOTS_ENABLED` gates the populate **and** the tick (fail-closed at boot, like every
  entrypoint via `sim/env.ts`).
- **Teardown:** a new **`botmk%`-scoped** purge RPC (same leaf-first, residue-reported pattern as
  `purge_synthetic_load_cohort`), independent of the other two cohorts. Persistent by design → deliberate-removal
  only, not routine; but it exists and proves to zero.
- **AI cost:** LLM showcase-text calls meter through `donny_cost_ledger` under the ≤15%-of-revenue cap.

## 4. Phase A1 — the populate (through real flows)

A new harness command `sim/cli.ts marketplace-seed` runs a **serial batch of real, RLS-enforced actions** (serial →
the mint-429 never bites; the runner-matrix egress wall is irrelevant here). Idempotent/resumable so it can top up.
SQL is used only for inert profile fields where a real flow adds no fidelity.

1. **Mint** ~400 `botmk` bots (100 business / 300 creator) with curated realistic profiles — names, bios, avatars,
   locations from curated pools.
2. **Businesses set up** `business_profiles` + organization; **~25–30 are multi-location** (one org, 2–4 `org_units`,
   `org_members` seats — exercising the team-account/org-unit paths). Each business creates curated
   **discounts/promotions** (location-scoped via the `*_org_unit` columns where multi-location).
3. **Publish campaigns** (~1–3 per business → ~150–300 total), a **mix of standard creator campaigns and CGC
   campaigns**. Curated structure + LLM briefs for the high-visibility text. Multi-location campaigns scope to a unit.
4. **Applications → collaborations:** creators apply via the real `apply_to_campaign`; businesses hire (real accept)
   → real collaborations. (For CGC campaigns: anonymous CGC submissions via the real anon-submission path.)
5. **Content delivery:** creators upload real deliverable files into DragonCandy's **own** storage buckets (curated
   sample assets) and submit through the content state machine. *Bonus:* yields real DragonCandy-hosted media — the
   working media source the load matrix's egress proxy was missing (points Sub-project C's `SAMPLE_MEDIA_URLS` at
   real content_file_paths).
6. **Messaging:** real threads between matched business/creator pairs through the real messaging path (+ realtime).
7. **DragonFeed:** creators post real DragonShare posts.
8. **Reviews:** completed collaborations produce real mutual reviews.

## 5. Phase A2 — the live tick + growth guard

- Extend the existing daily-tick to drive a **small delta of new activity each run**: fresh messages on existing
  threads, a few new applications, an occasional new campaign, new DragonFeed posts, reviews on newly-completed
  collaborations. Reuses the tick infrastructure already live at N=25.
- **Growth guard (mandatory for "ongoing on prod"):** cohort capped at ~400 (no runaway minting); campaigns capped
  per business; a rolling retention window prunes old messages/posts so prod storage does not balloon. The kill
  switch drains instantly.

## 6. Text seam (hybrid)

- **Curated pools** as TS arrays: realistic business names, creator handles/bios, discount kinds, message snippets,
  review phrasings, campaign types. Deterministic, zero AI cost, varied enough to read real at a glance.
- **LLM seam** only for showcase text (campaign briefs, a few threads), reusing the existing campaign-generation
  path; metered via `donny_cost_ledger`, respecting the 15% cap.

## 7. Testing & proof

- **TDD the harness logic offline** with injected deps (populate sequencer, tick delta, curated-pool selection,
  growth guard) — same style as the existing `sim/` tests.
- Real-flow actions exercise the **real RPCs** (apply/hire/upload/submit/message/review) — RLS-real.
- **Prove segregation** (founder `aios_*`/`platform_weight.*_real` byte-identical before/after) and
  **teardown-to-zero**, rollback-wrapped on prod, ONE statement per MCP call — the same discipline as every prior phase.

## 8. Verify-first / open items (resolve during implementation, do NOT fabricate)

- **CGC schema + flow** — the exact CGC campaign type, `cgc_*` tables/columns, anonymous-submission storage/RLS, and
  posting-preferences path (memory: [[project_cgc_anonymous_submission_constraints]]). Verify against prod before seeding.
- **Multi-location** — `organizations`/`org_units`/`org_members` seat + `*_org_unit` scoping columns and the
  team-account triggers ([[project_brand_logo_three_stores]] logo-sync trigger across the three stores).
- **Content-delivery state machine** — the real upload→submit→approve path + storage bucket RLS for bot uploads.
- **Messaging** — the real create-conversation / send-message RPCs + realtime publication.
- **Which profile fields are safe as inert SQL** vs must go through a flow (avoid trigger drift — diff CURRENT prod
  definitions, per the Phase-0 lesson).

## 9. Out of scope (explicit)

Stripe transactions (Sub-project B), the 200K load ramp (Sub-project C), a founder-only visibility gate (rejected —
prod-visible-to-all was chosen), and any change to the live crew (`bot0##`) or load (`botla`/`botseed`) cohorts.
