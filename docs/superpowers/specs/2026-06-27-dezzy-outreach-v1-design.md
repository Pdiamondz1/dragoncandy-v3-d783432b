# Dezzy AI — Outreach Machine v1 (reactivation-first, draft-only) — Design Spec

- **Date:** 2026-06-27
- **Status:** Draft (for review)
- **Branch/worktree:** `DC-Dezzy-AI`
- **Source idea:** `docs/wiki/analyses/the-core-idea-two-agents-one-company.md` (PR #189)
- **Approved plan:** `~/.claude/plans/can-we-update-the-sorted-fog.md`

## 1. Context & problem

The "Two Agents, One Company" wiki page proposes a second agent — **Dezzy AI** (the
founder renamed it from the doc's "Dame"; matches this worktree `DC-Dezzy-AI`) — that
serves *the company's growth* the way **Donny AI** serves *users*. It lists six domains.

The architectural decision (from the brainstorm): **Dezzy is NOT a new agent runtime.**
It is a **branded suite of AIOS Founder Playbooks + scheduled routines** on the rails
already shipped — `aios-playbook-run`, `aios-report-ingest`, the `/internal/corrections`
approval gate, `/schedule`'d routines, and the `/internal/briefings` Monday hub. This
slice builds **domain #2, the Outreach Machine**, reactivation-first and draft-only — the
highest-ROI, lowest-risk proof of the "Dezzy = playbook suite" pattern. It directly
attacks the doc's "current situation this week": 0 new signups, stalled campaigns, 0 new
boosts.

**Invariant preserved:** the agent *proposes/reports*; a human acts. v1 sends nothing —
Dezzy drafts, the founder copy-sends.

## 2. Verified constraint (the reason this needs code)

`supabase/functions/aios-playbook-run/index.ts` gives every playbook a **fixed set of six
*aggregate* READ tools** (`get_platform_stats`, `get_revenue_stats`, `get_cost_stats`,
`get_platform_weight_trend`, `get_latest_briefing`, `get_internal_doc`) plus
`propose_correction`. There is **no `execute_sql` and no row-level table access.**
`get_platform_stats` can say *"N campaigns are stalled"* but not *which ones, whose, or
their contact handles* — so the runner cannot draft per-target outreach today.

The runner **does** already hold a service-role `admin` client and is **admin-gated at
entry** (requires `user_roles.role='admin'`). So the minimal, correct fix is to add **one
new admin-gated read tool** backed by that existing service-role client — no migration, no
new RPC, no RLS change.

## 3. Goals / non-goals

**Goals (v1):**
- A report-only `dezzy-outreach` Founder Playbook that, on demand, segments in-app data,
  drafts a personalized reactivation message per qualifying target, and surfaces them at
  `/internal/playbooks/dezzy-outreach`.
- One new read tool (`get_reactivation_targets`) so the runner can pull the target rows.

**Non-goals (explicitly deferred):**
- One-tap / auto-send (in-app message or email) → **v1.5** (new table + `/internal/outreach`
  UI + send edge function).
- Scheduled weekly *push* → **v1.5** (on-demand *pull* in v1).
- Cold outreach / external prospect sourcing.
- The other five Dezzy domains.
- Re-skinning the runner's system-prompt identity to "Dezzy" (v1 sets the **voice** via the
  playbook's `preferences_md`; the engine identity string stays "Donny").

## 4. Design

### 4.1 New read tool — `get_reactivation_targets`

Added to `aios-playbook-run`'s `READ_TOOL_DEFINITIONS` and `executeReadTool`. It runs the
three segment queries via the function's **existing service-role `admin` client** (so it
sees all rows, unaffected by RLS) and returns capped, draft-ready arrays. `executeReadTool`'s
signature gains the `admin` client (currently only `userClient` is passed).

Return shape (each array capped at **15** to bound tokens; counts reported even when capped):

```json
{
  "generated_at": "<iso>",
  "stalled_campaigns": [
    {"campaign_id","title","days_stalled","business_name","business_handle",
     "creator_name","creator_handle","blocker"}
  ],
  "dormant_creators": [
    {"creator_name","handles":{"instagram","tiktok","youtube"},"days_since_activity","skills"}
  ],
  "lapsed_restaurants": [
    {"business_name","handle_or_website","days_since_signup","reason"}
  ]
}
```

**Data minimization / PII:** the tool returns **names + public social handles/URLs only —
NOT raw consumer emails.** Public handles are enough for the founder to send via DM (the
natural reactivation channel), and they keep consumer email addresses out of the model
context and the stored `result_summary_md`. Email-channel outreach is a v1.5 concern (it
arrives with the send path). The tool is admin-only by virtue of the function's entry gate.

### 4.2 Segment definitions (real columns confirmed in §6)

Thresholds are defaults — trivial to tune; at current data size they barely move the set.
"Account age > 7 days" everywhere so brand-new signups aren't mislabeled.

1. **Stalled campaigns** — `campaigns.status IN ('published','active')`, `created_at` > **14
   days** ago, with **no** `campaign_collaborations` row at `status='completed'` for that
   campaign. Two blockers:
   - *No collaboration at all* → nudge the **business** (owner = `campaigns.user_id` →
     `business_profiles.user_id`) to refresh/invite creators.
   - *Collaboration exists but unfinished* (`status='active'` / `content_status` not
     delivered, `updated_at` > 10 days) → nudge **business + matched creator**
     (`campaign_collaborations.creator_id`).
2. **Dormant creators** — `creator_profiles`, account age > 7 days, with **no
   `campaign_application` and no `dragonshare_post` in the last 21 days** (optionally
   `auth.users.last_sign_in_at` > 21 days). Contact = `creator_name` + best of
   `instagram_url`/`tiktok_url`/`youtube_url`.
3. **Lapsed restaurants** — `business_profiles.account_type='restaurant'`, account age > 7
   days, that have **never created a campaign** (`campaigns.user_id`) **or never boosted**
   (`dragonshare_boosts.boosting_user_id`). Contact = `business_name` +
   `instagram_url`/`website_url`.

> **Join semantics (mostly resolved):** per `src/integrations/supabase/types.ts`,
> `campaign_applications.creator_id` FKs to `profiles(id)` (= `auth.users.id`), **not**
> `creator_profiles.id`. So creator-side joins go **through `creator_profiles.user_id`**
> (e.g. `creator_profiles.user_id = campaign_applications.creator_id`). Confirm the same for
> `campaign_collaborations.creator_id` and validate both against a live row before the tool
> ships (per the `verify-db-schema` skill).

### 4.3 The `dezzy-outreach` playbook (seed row in `aios_playbooks`)

Created via the existing `/internal/playbooks` create UI **or** a seed migration.

- **slug:** `dezzy-outreach`
- **title:** `Dezzy — Weekly Reactivation Outreach`
- **status:** `active` (else `aios-playbook-run` rejects the first Run with a 409 "playbook is archived")
- **allowed_proposals:** `[]` (report-only)
- **task_md:** call `get_reactivation_targets`; for **every** returned target draft a short
  personalized message; group output by segment; per draft include the target name, the
  **specific hook** (campaign title / dormancy length / "never launched"), and the
  **suggested channel** (handle). If a segment is empty, say so. Do not invent targets or
  numbers beyond the tool result.
- **preferences_md:** the **Dezzy voice** — warm, concise, founder-to-user, one clear CTA,
  no overpromising, ≤ ~60 words per message, no fabricated personalization. "Write as Dezzy,
  DragonCandy's growth agent."
- **done_criteria_md:** "A draft exists for every returned target (or the segment is
  explicitly marked empty); each draft names the target + a specific hook + a channel; the
  message ends with the required JSON self-assessment." (Consumed only as the run's
  legibility self-check — `done_check`.)

### 4.4 Mechanism (v1 = pull)

Founder opens `/internal/playbooks/dezzy-outreach`, clicks **Run** during the Monday review,
reads the drafts in the run's `result_summary_md`, copy-sends the good ones. Reuses the
existing run UI, `aios_playbook_runs` storage, the partial-unique in-flight guard, the
done-check chip, and stale-run reaping — **no new UI.**

## 5. Scope of change

- **Edit:** `supabase/functions/aios-playbook-run/index.ts` — add `get_reactivation_targets`
  tool definition; add its `executeReadTool` case (3 segment queries via `admin`); thread the
  `admin` client into `executeReadTool`. **Redeploy** the function (MCP/CLI; preserve
  `verify_jwt=false`; boot-check; Codex pass).
- **Seed:** one `aios_playbooks` row (`dezzy-outreach`).
- **None of:** new table, new RPC, migration, new secret, new OAuth scope, new UI, send path,
  schedule, or `donny-chat` change.

## 6. Verification (done + planned)

**Done (read-only prod probes, project `zocahiffooqdybdhguqv`):**
- Tool surface confirmed: 6 aggregate read tools, no row access (§2).
- Schema confirmed for all segment columns (`campaign_collaborations.status/content_status/
  completed_at/updated_at`, `campaigns.status/user_id/created_at`, `creator_profiles` socials,
  `business_profiles.account_type`, `dragonshare_boosts.boosting_user_id`).
- Data size: 13 creators, 11 restaurants (+6 brands), 17 campaigns (15 published / 2 active),
  12 collaborations (10 completed / 2 active), 7 boosts, 10 DragonShare posts. → segments are
  single-digit; v1 drafts *all qualifying up to the cap* rather than a fixed 10+5 quota.

**Planned (implementation):**
1. Confirm the `creator_id` join semantics (§4.2) against a live row.
2. Run each segment query in isolation via `execute_sql`; sanity-check counts and contents.
3. Deploy the edited function; boot-check; run the `dezzy-outreach` playbook on prod data.
4. Eyeball the drafts for quality, correctness, channel sanity, and **no email/PII leakage**;
   confirm the report renders at `/internal/playbooks/dezzy-outreach`.
5. Codex second review; then `knowledge-sync` (update the existing wiki analysis page).

## 7. Risks

- **Tiny dataset** → drafts may be few; that's expected pre-launch, not a failure.
- **Join-semantics ambiguity** on `creator_id` (mitigated by §6 step 1 before ship).
- **Shared edge function** — the new tool is visible to all playbooks (harmless; consistent
  with the existing shared-superset tool design) and the redeploy touches a live internal
  function → Codex pass + boot-check required.
- **PII** — mitigated by returning public handles only, admin-gated, no stored emails.
- **Output token ceiling** — a report-only playbook (`allowed_proposals: []`) runs at
  `max_tokens: 8192`. At the cap (15×3 = 45 drafts ≤ ~60 words) and current single-digit data
  sizes this fits comfortably; flagged only so a future scale-up of the per-segment cap doesn't
  silently truncate the report.

## 8. Open questions for review

1. Segment thresholds (14d stalled / 21d dormant / never-vs-30d lapsed) — accept defaults?
2. Confirm **no raw emails** to the model in v1 (handles-only)?
3. Cap of 15/segment — fine, or different?
4. Seed the playbook via the `/internal/playbooks` UI (no migration) or a seed migration
   (reproducible, in-repo)?
