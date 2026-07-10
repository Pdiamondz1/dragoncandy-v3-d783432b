# Crews Phase 2 — Crew Activity & Team Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each crew a role-scoped **Crew Activity feed** + team-oriented notification fan-out on crew campaign lifecycle events, so the business sees its crew's whole pipeline and the right people are notified (bell + high-signal email) — without leaking creators' private data to each other.

**Architecture:** A dedicated `crew_activity` event log is written through **one forge-proof `record_crew_activity` RPC** (per-event authorization matrix + server-derived facts). A thin frontend wrapper calls the RPC at each lifecycle site, then fans out via the existing `create-notification` choke point using a **pure, unit-tested notification module**. Two feed surfaces (business Activity tab + creator activity strip) read the log under asymmetric RLS. The only edge-fn deploy is the email-type mapping.

**Tech Stack:** React 18 + TS (strict), Supabase (Postgres + RLS + Deno edge functions), React Query, Vitest, Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-10-crews-phase2-activity-design.md` · **Branch:** `feat/crews-phase2-activity`

---

## Conventions

- Migration timestamps: `ls supabase/migrations | tail -3`, pick strictly greater (e.g. `20260710HHMMSS`).
- Apply migrations via Supabase MCP `apply_migration` at the deploy step; **migrations land before frontend that reads the new table/RPC**. After definer DDL run `get_advisors(security)` and revoke `execute` from `anon` on the RPC (grant `authenticated`). Regenerate `src/integrations/supabase/types.ts`.
- Notifications go through `create-notification` (bell + email choke point) — never `send-notification-email` directly.
- `dc-*` tokens, pill buttons, no gray; desktop `lg:`/`xl:`, mobile base. No `any`; explicit `.select()` field lists; loading/error/empty states.
- Commit after each task; trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01EbY6RdPfbJKcpJpVYt3Z2P`.
- Reuse Crews v1 primitives: `creator_groups`, `creator_group_members`, `is_active_group_member`, `is_creator_group_owner`, `campaigns.group_id`.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `docs/... (this plan's Task 0 notes)` | — | The verified de-dup overlap table (recorded in Task 0) |
| `supabase/migrations/<ts>_crew_activity_table.sql` | Create | `crew_activity` table + indexes + RLS (owner + creator SELECT; no client write) |
| `supabase/migrations/<ts>_record_crew_activity_rpc.sql` | Create | `record_crew_activity(p_campaign_id, p_event_type)` SECURITY DEFINER — authz matrix + server-derived facts + insert + RETURNS facts |
| `src/lib/crews/crewActivityNotifications.ts` | Create | **Pure** map: `(event_type, facts) → create-notification payloads to fire` (the §5 "ADDS" column) |
| `src/lib/crews/crewActivityNotifications.test.ts` | Create | Vitest for the pure map (the §5 table + no-cross-creator-leak) |
| `src/lib/crews/recordCrewActivity.ts` | Create | Thin wrapper: call RPC → payloads via the pure map → fire `create-notification` |
| `src/hooks/useCreateApplication.ts` | Modify | +`recordCrewActivity(campaignId,'application_received')` on success |
| `src/hooks/useManageApplication.ts` | Modify | +`'hired'` on accept |
| `src/hooks/useProjectComplete.ts` | Modify | +`'completed'` on completion (no `paid` — free crews) |
| `<content submit/approve/revision hook>` | Modify | +`'content_submitted'`/`'content_approved'`/`'revision_requested'` (site located in Task 0) |
| `src/hooks/useCampaignCreator.ts` | Modify | +`'campaign_posted'` on crew launch (reuse existing group_campaign_posted bell — see Task 0/§5) |
| `src/hooks/useCrewActivity.ts` | Create | Business: crew activity for a groupId (paginated) |
| `src/hooks/useMyCrewActivity.ts` | Create | Creator: own-visible crew activity |
| `src/components/groups/CrewActivityFeed.tsx` | Create | Shared feed list (row = actor · event · campaign · time) |
| `src/pages/CreatorGroupDetailPage.tsx` | Modify | Add an "Activity" tab/section |
| `src/pages/CreatorCampaignMarketplace.tsx` | Modify | Add a creator activity strip in the Crews tab |
| `src/types/notifications.ts` + `supabase/functions/create-notification/index.ts` | Modify | Add crew types to `NOTIFICATION_TYPE_TO_EMAIL_TYPE` |
| `supabase/functions/send-notification-email/index.ts` | Modify | Crew email templates (or reuse closest) |

---

## Task 0: Verify the de-dup overlap table (NO CODE — required first)

**Goal:** confirm, against the real current call sites, exactly what the standard lifecycle already notifies (recipient + email) per event, so the §5 "ADDS" column is correct before any code.

- [ ] **Step 1:** For each event, grep the current `create-notification` call and record recipient + `type` + `category` + whether it maps to email today (`NOTIFICATION_TYPE_TO_EMAIL_TYPE` in `supabase/functions/create-notification/index.ts`):
  - `application_received` — `src/hooks/useCreateApplication.ts` (owner, `campaigns`).
  - `hired` — `src/hooks/useManageApplication.ts` (`campaign_hired` → hired creator, `campaigns`).
  - `completed` — `src/hooks/useProjectComplete.ts` (`project_completed` → owner **and** creator, `transactions`).
  - `content_submitted` / `content_approved` / `revision_requested` — locate the hook (candidates: `useProjectComplete` content_status branch, a content-review hook, `useCollaboration`). Record recipient/type/category.
  - `paid` — determine whether a distinct notice fires or the amount is folded into `project_completed` (check `useProjectComplete` payout-success + `release-creator-payout`).
  - `campaign_posted` — confirm `useCampaignCreator` fires `group_campaign_posted` (bell) to active members (Crews v1).
- [ ] **Step 2:** Write the confirmed overlap table into this plan file (edit the table below) and reconcile any cell that differs from spec §5. If an event's standard notice already covers the ADDS recipient+email, the ADD is "row only".
- [ ] **Step 3:** Commit the plan edit (`docs: verified crew-activity de-dup overlap table`). No source code yet.

**Confirmed overlap (VERIFIED against current code — Task 0 complete):**
| event | standard sends (recipient / type / category / email today) | call site | recordCrewActivity ADDS |
|---|---|---|---|
| campaign_posted | active members / `group_campaign_posted` / campaigns / **NO email** (type unmapped → `resolvedEmailType` undefined, so no email despite campaigns default) | `useCampaignCreator.ts` (crew launch, v1) | **row** (bell already sent by v1) + **NEW email mapping** `group_campaign_posted`→crew template (Task 8). Pure map returns `[]`. |
| application_received | owner / `application_received` / campaigns / **YES** (`new_application`, campaigns email=true) | `useCreateApplication.ts` onSuccess | **row only** (owner already belled+emailed) |
| hired | hired creator / **`application_accepted`** / campaigns / **YES** (`application_status`, campaigns email=true) | `useManageApplication.ts` accept path | **row only** (creator already belled+emailed) |
| content_submitted | **NOBODY** — Submit-for-Review only updates `content_status='submitted'`, fires **no** `create-notification` | `SubmitForReviewButton.tsx` | **GAP → fire ONE new payload to OWNER** (recipientId=owner_id, category `content`). The single event where the pure map returns a payload. |
| content_approved | hired creator / `content_approved` / content / mapped but category `content` email=**false** default → no email unless opted-in | `ContentReviewSection.tsx` `approveContent` | **row only** (creator already belled) |
| revision_requested | hired creator / `revision_requested` / content / mapped but category `content` email=**false** default → no email unless opted-in | `ContentReviewSection.tsx` `requestRevision` | **row only** (creator already belled) |
| completed | owner **AND** creator / `project_completed` / transactions / **YES both** (`project_completion`, transactions email=true) | `useProjectComplete.ts` both-approved branch | **row only** (both already belled+emailed) |
| paid | **NO distinct notice** — amount folded into `project_completed` emailData; for crews the payout is **skipped entirely** | `useProjectComplete.ts` payout branch / `release-creator-payout` | **row only** (creator already belled+emailed via `completed`). Amount **always null for crews**. |

**Reconciliations / contradictions with spec §5 + plan assumptions (downstream tasks MUST use these):**
1. **`hired` type is `application_accepted`, NOT `campaign_hired`** (plan §5 + Task 5 mislabel). The accept path (`useManageApplication.ts`) fires a `create-notification` bell of type **`application_accepted`** (category `campaigns`, already email-mapped → `application_status`) to the hired creator; `campaign_hired` is only a separate **`donny_nudges`** row (not a bell/email). So `hired` is already belled+emailed → **ADDS = row only** (no "email hired creator" needed).
2. **`content_submitted` has NO owner notification today** (contradicts the §5 "row only" default). `SubmitForReviewButton` only writes `content_status='submitted'`. Related-but-distinct: `useFileUploadNotification` fires a `file_uploaded` bell to the owner at *upload* time (category `content`, email off by default), and the mutual-complete path (`useProjectComplete`, creator marks complete) fires `completion_request` — but neither is the discrete Submit-for-Review event. **This is the one real gap → the pure map fires a payload to the owner** (Task 3). It is also NOT written to `payment_events` (confirmed: no `content_submitted` rows in prod; `PaymentsPage.tsx`/`PaymentSummaryCards.tsx` derive pending-review from `content_status`, not events).
3. **`completed` already emails BOTH parties** (not just "email owner" as §5 assumed). `project_completed` is email-mapped + category `transactions` (email=true), fired to owner AND creator in `useProjectComplete.ts`. **ADDS = row only.**
4. **`paid` — no distinct notification + NO `payment_events` row for crews.** No separate `paid` bell exists; the amount is folded into `project_completed`'s emailData. Critically, `useProjectComplete.ts` (line ~114) **skips `release-creator-payout` when `campaign.group_id` is set** (crews are free), so for a crew campaign `payoutSuccess` is never true, `payoutAmount` stays 0, and **no `payment_events` row is ever written**. Consequences for Task 2/5: (a) the RPC's amount lookup finds nothing for crews → `v_amount` is NULL → `jsonb_strip_nulls` drops it (the `paid` feed line just omits the amount — do NOT fabricate); (b) if Task 5 gates `paid` on `payoutSuccess`, it **never fires for a crew campaign** — wire it on the crew-completion path (or accept `paid` is effectively a no-op / $0 line for free crews). **ADDS = row only** (creator already belled+emailed via `completed`).
5. **`campaign_posted` is NOT email-mapped today** (confirmed): `group_campaign_posted` is absent from `NOTIFICATION_TYPE_TO_EMAIL_TYPE`, so `resolvedEmailType` is undefined and no email sends even though category `campaigns` defaults email=true. The one genuinely-new email mapping in Task 8.

**Confirmed schema facts for the RPC (Task 2):**
- `profiles.full_name` — **exists** (`text`). ✓ (actor-name source)
- `creator_profiles.creator_name` — **exists** (`text`). ✓ (participant creator-name source)
- **`payment_events` amount column is `amount_cents` (integer, CENTS) — there is NO `amount` column.** The plan's RPC `SELECT amount INTO v_amount ...` is wrong: use **`amount_cents`** and divide by 100 for dollars. Also its filter `event_type ILIKE '%payout%'` is wrong — the real payout rows are `payment_released` / `transfer_created` / `payment_release_initiated` / `payout_pending_wallet` (`payment_released`/`transfer_created` do NOT contain "payout"). MOOT for v1 since crews write no `payment_events` row at all (contradiction #4) — `v_amount` will be NULL for every crew `paid`; only fix the column/filter if a future paid-crew path exists.

---

## Task 1: `crew_activity` table + RLS

**Files:** Create `supabase/migrations/<ts>_crew_activity_table.sql`

- [ ] **Step 1: Write the migration.**
```sql
CREATE TABLE public.crew_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.creator_groups(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id),
  participant_id uuid REFERENCES public.profiles(id),
  event_type text NOT NULL CHECK (event_type IN
    ('campaign_posted','application_received','hired','content_submitted',
     'content_approved','revision_requested','completed')),
  -- NOTE (Task 0): 'paid' is DROPPED — crew campaigns are free (no escrow/payout), so no
  -- payment event ever occurs. It returns only with Phase-3 paid crews.
  visibility text NOT NULL CHECK (visibility IN ('business','crew')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crew_activity_group ON public.crew_activity(group_id, created_at DESC);
CREATE INDEX idx_crew_activity_participant ON public.crew_activity(participant_id) WHERE participant_id IS NOT NULL;

ALTER TABLE public.crew_activity ENABLE ROW LEVEL SECURITY;

-- SELECT only for clients. Owner sees all their crews' rows; creator sees crew-wide rows
-- (as an active member) OR any row where they are the participant. Parenthesize exactly.
CREATE POLICY crew_activity_owner_select ON public.crew_activity
  FOR SELECT USING (public.is_creator_group_owner(group_id, auth.uid()));
CREATE POLICY crew_activity_creator_select ON public.crew_activity
  FOR SELECT USING (
    (visibility = 'crew' AND public.is_active_group_member(group_id, auth.uid()))
    OR participant_id = auth.uid()
  );
-- No INSERT/UPDATE/DELETE policy: rows are written only by the SECURITY DEFINER RPC (Task 2).
```
- [ ] **Step 2:** Sanity-check SQL. Do NOT apply yet (applied at the deploy checkpoint, Task 9).
- [ ] **Step 3:** Commit.

---

## Task 2: `record_crew_activity` RPC (forge-proof write)

**Files:** Create `supabase/migrations/<ts>_record_crew_activity_rpc.sql`

- [ ] **Step 1: Write the RPC.** It takes ONLY `(p_campaign_id, p_event_type)`; re-derives everything; enforces the per-event authorization matrix; inserts; RETURNS the facts the frontend needs to fan out.
> **Participant keying (plan-review fix):** owner-emitted events (`hired`/`completed`/`paid`/…) concern
> a *specific* creator. Crew v1 campaigns are **single-winner** (Task 0 confirms 1 collaboration per crew
> campaign — `creator_count=1` + accept auto-declines siblings), so today "the campaign's collaboration"
> is unambiguous. But to be robust + Phase-3-ready (multi-creator crews are a deferred feature), the RPC
> takes an explicit `p_collaboration_id` for these events and validates it belongs to the campaign —
> NEVER "most recent collaboration" (which would mis-attribute and leak one creator's event to another).

```sql
CREATE OR REPLACE FUNCTION public.record_crew_activity(
  p_campaign_id uuid, p_event_type text, p_collaboration_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_campaign record;
  v_uid uuid := auth.uid();
  v_participant uuid;
  v_visibility text;
  v_actor_name text;
  v_creator_name text;
  v_row_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;   -- null-safe owner check (defense-in-depth)
  SELECT id, user_id, group_id, title INTO v_campaign
    FROM campaigns WHERE id = p_campaign_id;
  IF NOT FOUND OR v_campaign.group_id IS NULL THEN
    RETURN NULL;                       -- no-op off the crew path
  END IF;

  -- Per-event authorization + participant derivation (reject unauthorized emitters).
  IF p_event_type = 'campaign_posted' THEN
    IF NOT is_creator_group_owner(v_campaign.group_id, v_uid) THEN RAISE EXCEPTION 'unauthorized'; END IF;
    v_visibility := 'crew'; v_participant := NULL;
  ELSIF p_event_type = 'application_received' THEN
    -- emitter must be an active member who has an application on this campaign
    IF NOT (is_active_group_member(v_campaign.group_id, v_uid)
            AND EXISTS (SELECT 1 FROM campaign_applications WHERE campaign_id = p_campaign_id AND creator_id = v_uid))
       THEN RAISE EXCEPTION 'unauthorized'; END IF;
    v_visibility := 'business'; v_participant := v_uid;
  ELSIF p_event_type = 'content_submitted' THEN
    IF NOT EXISTS (SELECT 1 FROM campaign_collaborations WHERE campaign_id = p_campaign_id AND creator_id = v_uid)
       THEN RAISE EXCEPTION 'unauthorized'; END IF;
    v_visibility := 'business'; v_participant := v_uid;
  ELSIF p_event_type IN ('hired','content_approved','revision_requested','completed') THEN
    IF v_campaign.user_id <> v_uid THEN RAISE EXCEPTION 'unauthorized'; END IF;   -- owner only
    v_visibility := 'business';
    -- Participant from the EXPLICIT collaboration (validated to belong to this campaign).
    -- v1 single-winner fallback: if null, use the sole collaboration; RAISE if ambiguous (>1).
    IF p_collaboration_id IS NOT NULL THEN
      SELECT creator_id INTO v_participant FROM campaign_collaborations
        WHERE id = p_collaboration_id AND campaign_id = p_campaign_id;
      IF v_participant IS NULL THEN RAISE EXCEPTION 'collaboration not on campaign'; END IF;
    ELSE
      -- STRICT is required to actually raise on ambiguity: plain SELECT INTO silently takes the first
      -- (unordered) row; INTO STRICT raises NO_DATA_FOUND (0) / TOO_MANY_ROWS (>1). v1 single-winner
      -- guarantees exactly one row, so this succeeds; a Phase-3 multi-hire correctly RAISEs (forbid
      -- ambiguity — the caller must pass p_collaboration_id).
      SELECT creator_id INTO STRICT v_participant FROM campaign_collaborations
        WHERE campaign_id = p_campaign_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown event_type %', p_event_type;
  END IF;

  -- Server-derived, whitelisted metadata (never trust the client).
  SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_uid;
  IF v_participant IS NOT NULL THEN
    SELECT COALESCE(cp.creator_name, p.full_name) INTO v_creator_name
      FROM profiles p LEFT JOIN creator_profiles cp ON cp.user_id = p.id WHERE p.id = v_participant;
  END IF;
  -- (No amount: crew campaigns are free — 'paid' is not an event. See Task 0.)

  INSERT INTO crew_activity (group_id, campaign_id, actor_id, participant_id, event_type, visibility, metadata)
  VALUES (v_campaign.group_id, p_campaign_id, v_uid, v_participant, p_event_type, v_visibility,
          jsonb_strip_nulls(jsonb_build_object(
            'campaign_title', v_campaign.title,
            'creator_name', v_creator_name)))
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object(
    'id', v_row_id, 'group_id', v_campaign.group_id, 'owner_id', v_campaign.user_id,
    'participant_id', v_participant, 'event_type', p_event_type,
    'campaign_id', p_campaign_id, 'campaign_title', v_campaign.title,
    'creator_name', v_creator_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_crew_activity(uuid, text, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.record_crew_activity(uuid, text, uuid) TO authenticated;
```
> The RPC bodies (`payment_events` amount column, `campaign_collaborations` shape) must be reconciled against the real schema during Task 0/2 — the above is the contract, adjust field names to match.
- [ ] **Step 2:** Sanity-check. Do NOT apply yet.
- [ ] **Step 3:** Commit.

---

## Task 3: Pure notification map (TDD)

**Files:** Create `src/lib/crews/crewActivityNotifications.ts` + `.test.ts`

The RPC returns *facts*; this pure module maps `(event_type, facts)` → the `create-notification` payloads to fire — **but ONLY the genuinely-new ones** (recipients the standard lifecycle does NOT already bell). This is the de-dup, as a static decision.

**LINCHPIN CONSTRAINT (do not violate):** `create-notification` **always inserts a bell** and only
*conditionally* emails — there is **no email-only mode**. Therefore:
- To add an **email** to a recipient the standard path already bells, you map that recipient's
  **existing standard notification type** to email in Task 8 (`NOTIFICATION_TYPE_TO_EMAIL_TYPE`).
  You **never** fire a second `create-notification` for it (that would double-bell).
- The pure map fires a payload ONLY for a recipient/event the standard path does NOT already notify.

**Consequence (verified in Task 0):** the standard high-signal emails are already mapped
(`application_received`→`new_application`, accept→`application_accepted`, `project_completed`), so for
`application_received` / `hired` / `completed` the owner + participant are already belled+emailed
→ the pure map returns **`[]` (row only)**. Task 0 confirmed exactly one gap: **`content_submitted` →
the owner is NOT notified today**, so the pure map fires one payload to `owner_id` (category `content`,
email off by default). (`paid` is dropped — free crews have no payment.) The only
genuinely-new **email** mapping is the crew-specific `group_campaign_posted` (Task 8) — a mapping, not a
map payload. So in v1 the pure map is mostly `[]`; recordCrewActivity's main job is **writing the row**.

- [ ] **Step 1: Write failing tests** using the Task-0-verified overlap: `hired`/`completed`/`application_received` → **`[]`** (already belled by the standard path); **`content_submitted` → `[{recipientId: owner_id, type:'content_submitted', category:'content'}]`** (Task 0 confirmed the owner is NOT notified today — the one real gap); `campaign_posted` → `[]` (v1 bell already sent; email via the Task-8 mapping). No `paid` (dropped — crews are free). Assert **no payload ever targets a recipient other than owner_id or participant_id** (no cross-creator leak) and **no payload duplicates a recipient the standard path already bells**.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `crewActivityNotifications(facts): NotificationPayload[]` — a switch over `event_type` returning only the genuinely-new payloads per the Task-0 table. Pure, no I/O.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit.

---

## Task 4: `recordCrewActivity` wrapper

**Files:** Create `src/lib/crews/recordCrewActivity.ts`

- [ ] **Step 1: Implement** `recordCrewActivity(campaignId: string, eventType: CrewEventType, collaborationId?: string): Promise<void>`:
  - `const { data: facts } = await supabase.rpc('record_crew_activity', { p_campaign_id: campaignId, p_event_type: eventType, p_collaboration_id: collaborationId ?? null });`
  - if `!facts` → return (non-crew campaign, RPC no-op'd).
  - `for (const p of crewActivityNotifications(facts)) supabase.functions.invoke('create-notification', { body: p }).catch(console.error);`
  - Fire-and-forget; never throw into the caller (best-effort fan-out, per spec R1). Invalidate `['crew-activity']`/`['my-crew-activity']` query keys.
- [ ] **Step 2:** `npm run typecheck` (needs regenerated types incl. the RPC — see Task 9 ordering; until then use a narrow local type for `facts`). Build clean.
- [ ] **Step 3:** Commit.

---

## Task 5: Instrument the lifecycle sites

**Files (Modify):** `useCreateApplication.ts`, `useManageApplication.ts`, `useProjectComplete.ts`, the content submit/approve/revision hook (Task 0), `useCampaignCreator.ts`.

- [ ] For each site, after the existing success/notification logic, add one call gated only by the RPC's own `group_id` no-op:
  - `useCreateApplication` onSuccess → `recordCrewActivity(campaignId, 'application_received')` (participant = caller; no collab id).
  - `useManageApplication` accept path → `recordCrewActivity(campaignId, 'hired', collaborationId)` — pass the just-created collaboration id (owner-emitted participant event).
  - **`src/components/campaigns/SubmitForReviewButton.tsx`** (Task-0-located site) submit → `recordCrewActivity(campaignId, 'content_submitted')` (participant = caller). **`src/components/campaigns/ContentReviewSection.tsx`** approve → `('content_approved', collaborationId)`; revision → `('revision_requested', collaborationId)` (owner-emitted → pass collab id).
  - `useProjectComplete` completion → `('completed', collaborationId)`. **No `paid`** (dropped — free crews have no payout; `useProjectComplete` skips `release-creator-payout` for crews).
  - `useCampaignCreator` crew launch (already fires `group_campaign_posted`) → `recordCrewActivity(campaignId, 'campaign_posted')` (writes the row; the pure map returns no new bell — email via the Task-8 mapping).
- [ ] Build + typecheck clean. Commit (can be one commit or per-site).

---

## Task 6: Feed hooks

**Files:** Create `src/hooks/useCrewActivity.ts`, `src/hooks/useMyCrewActivity.ts`

- [ ] `useCrewActivity(groupId)` — `.from('crew_activity').select('id, campaign_id, actor_id, participant_id, event_type, visibility, metadata, created_at').eq('group_id', groupId).order('created_at',{ascending:false}).limit(50)`. RLS returns only the owner's-visible rows. Enrich actor/participant names if not already in metadata. Key `['crew-activity', groupId]`.
- [ ] `useMyCrewActivity()` — same table, no group filter, `.order(...).limit(30)`; RLS returns only the creator-visible rows (crew-wide + own participation). Key `['my-crew-activity', user?.id]`.
- [ ] Build/typecheck clean. Commit.

---

## Task 7: Feed UI

**Files:** Create `src/components/groups/CrewActivityFeed.tsx`; Modify `CreatorGroupDetailPage.tsx`, `CreatorCampaignMarketplace.tsx`

- [ ] **CrewActivityFeed** — renders a list of activity rows: an icon per `event_type`, a one-line summary built from `metadata` (`{creator_name} was hired for {campaign_title}`, `New content submitted for {campaign_title}`, `{campaign_title} completed`, etc.), relative time, and a link to the campaign/proposals. Loading/empty/error. Pure presentational (takes `items`).
- [ ] **Business — `CreatorGroupDetailPage`:** add an "Activity" tab/section using `useCrewActivity(id)` → `CrewActivityFeed`.
- [ ] **Creator — `CreatorCampaignMarketplace` Crews tab:** add a compact activity strip using `useMyCrewActivity()` → `CrewActivityFeed` (condensed), above the crew campaigns.
- [ ] Build/typecheck clean; `dc-*` tokens, both viewports. Commit.

---

## Task 8: High-signal email

**Files (Modify):** `src/types/notifications.ts`, `supabase/functions/create-notification/index.ts`, `supabase/functions/send-notification-email/index.ts`

Per Task 0, the standard high-signal types (`new_application`, `application_accepted`, `project_completed`)
are **already email-mapped**, so `application_received`/`hired`/`completed`/`paid` need **no new mapping**
(their emails already fire). The scope here is minimal:

- [ ] **The one genuinely-new mapping:** map the crew-specific **`group_campaign_posted`** type to a
  crew email template in `NOTIFICATION_TYPE_TO_EMAIL_TYPE` (both `create-notification/index.ts` and the
  mirrored `src/types/notifications.ts`). This changes **crew behavior only** (the type is crew-specific),
  so it's safe. Category `campaigns`.
- [ ] **Any Task-0 gap only:** if Task 0 found a genuine missing email (e.g. the owner's content-submit
  type isn't mapped and the §5 table wants it), map that specific type too. **Do NOT globally remap a
  SHARED standard type** (e.g. `project_completed`) just for crews — it's already emailed, and remapping
  would change non-crew behavior (explicit non-goal).
- [ ] Add the `group_campaign_posted` email template to `send-notification-email` (subject/body; reuse
  the closest existing template shape). Additive; watch the template-literal-backtick Deno-bundle hazard.
- [ ] Build clean. Commit. (Deploy in Task 9.)

---

## Task 9: Deploy + verify (checkpoint)

- [ ] **Apply** Task 1 + Task 2 migrations to prod via MCP (table → RPC). Run `get_advisors(security)` — confirm the RPC is not anon-executable, `search_path` set, `crew_activity` RLS present + no anon leak. Regenerate `src/integrations/supabase/types.ts`; fix any narrow local types from Task 4.
- [ ] **Deploy** `create-notification` + `send-notification-email` (run `edge-function-reviewer` first; preserve each `verify_jwt`; MCP `list_edge_functions` is ground truth).
- [ ] **Forge test (SQL, rolled back):** (a) a non-owner member calling `record_crew_activity(<crew campaign>, 'completed', …)` must RAISE `unauthorized`; owner succeeds. (b) the applicant calling `'application_received'` succeeds; a different member RAISEs. (c) a non-participant member calling `'content_submitted'` RAISEs; the participant succeeds. (d) owner calling `'completed'` with a `p_collaboration_id` for a *different* campaign RAISEs `collaboration not on campaign`. Confirm no `crew_activity` row persists after rollback.
- [ ] **Two-creator crew test (spec §11.2):** crew campaigns are **single-winner**, so only ONE member is hired. Owner posts a crew campaign → both members A,B get `campaign_posted` (bell + email) + see it; A applies → owner sees `application_received` (feed + bell/email), **B sees nothing**; hire A → A gets `hired`, B doesn't; A submits → owner sees `content_submitted` (feed + bell), B doesn't; complete → owner + A see `completed`, **B sees none of A's activity anywhere** (feed, bell, RLS). (Multi-hire is structurally impossible in v1; the explicit `p_collaboration_id` keying is the Phase-3 safeguard.)
- [ ] **Non-crew regression:** a normal public/paid campaign apply→accept→complete writes **zero** `crew_activity` rows and behaves unchanged.

---

## Task 10: Final gates

- [ ] `npm run build && npm run typecheck && npx vitest run src/lib/crews/` clean.
- [ ] Codex second review (`codex review --base main`); fix findings + re-run. Independent adversarial review over the forge/RLS/privacy surface (as in Crews v1) if time allows.
- [ ] `verify-prod` (both viewports, console errors) post-deploy.
- [ ] `knowledge-sync` (update `docs/wiki/concepts/creator-groups.md` with the activity layer + DATABASE_SCHEMA `crew_activity` + PROJECT_CONTEXT bullet; Donny RAG post-merge).
- [ ] Open PR via `finishing-a-development-branch`.

---

## Notes / gotchas

- **Migrations before frontend/types:** the RPC + table must exist before `record_crew_activity` typechecks; regenerate types at Task 9. During Tasks 3–8 use a narrow local `CrewActivityFacts` type.
- **De-dup is static (Task 0/3):** the pure map returns only the ADDS; it never does a runtime `push_notifications` lookup. If Task 0 finds an event's standard notice already emails the ADDS recipient, the map returns `[]` (row only) for that recipient.
- **Forge-proofing lives in the RPC** (per-event authz + server-derived metadata) — the frontend never sends `visibility`/`participant`/`amount`. Don't move that logic client-side.
- **Privacy test is mandatory** (two-creator crew) — a creator must never see another creator's application/content/rate/earnings via the feed, RLS, or metadata.
- **Concurrent Lovable/founder PRs:** re-fetch origin/main + check collisions on the touched hooks (`useProjectComplete`, `useManageApplication`, `useCampaignCreator`, `CreatorCampaignMarketplace`) and the two edge fns before deploy/merge.
- **Idempotency:** `crew_activity` has no unique key, so an `onSuccess` retry/double-fire can write a
  duplicate row (visibility gates exposure to owner+self, so low severity). v1 accepts duplicates as a
  known gap; optionally add a partial unique index on `(campaign_id, event_type, participant_id)` for the
  once-per-participant events (`hired`/`completed`) if duplicates show up in testing.
- **`paid` dropped (Task 0):** crew campaigns are free (`campaigns_group_free` CHECK, no escrow/payout),
  so no payment event ever occurs — `paid` is not a crew event. The "transactions" slice of the
  notification vision applies only to Phase-3 *paid* crews. No `payment_events` read anywhere.
- **Deferred (NOT now):** paid-crew events (Phase 3); crew chat; org-team fan-out (other `org_members`); digest email; realtime feed; reactions/read-receipts; global all-crews activity page.
