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
| `src/hooks/useProjectComplete.ts` | Modify | +`'completed'` on completion, +`'paid'` on payout-success |
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

**Confirmed overlap (fill in Step 2):**
| event | standard sends (recipient / type / email today) | recordCrewActivity ADDS |
|---|---|---|
| campaign_posted | members / `group_campaign_posted` / no | reuse v1 bell + add email mapping; row |
| application_received | owner / `application_received` / (verify) | email owner (if not already); row |
| hired | hired creator / `campaign_hired` / (verify) | email hired creator; row |
| content_submitted | (verify) | (derive) |
| content_approved | (verify) | row only |
| revision_requested | (verify) | row only |
| completed | owner+creator / `project_completed` / (verify) | email owner; row |
| paid | (verify — may be folded into completed) | email creator; row |

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
     'content_approved','revision_requested','completed','paid')),
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
```sql
CREATE OR REPLACE FUNCTION public.record_crew_activity(p_campaign_id uuid, p_event_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_campaign record;
  v_uid uuid := auth.uid();
  v_participant uuid;
  v_visibility text;
  v_amount numeric;
  v_actor_name text;
  v_creator_name text;
  v_row_id uuid;
BEGIN
  SELECT id, user_id, group_id, title, fixed_price INTO v_campaign
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
  ELSIF p_event_type IN ('hired','content_approved','revision_requested','completed','paid') THEN
    IF v_campaign.user_id <> v_uid THEN RAISE EXCEPTION 'unauthorized'; END IF;   -- owner only
    v_visibility := 'business';
    SELECT creator_id INTO v_participant FROM campaign_collaborations
      WHERE campaign_id = p_campaign_id ORDER BY created_at DESC LIMIT 1;
  ELSE
    RAISE EXCEPTION 'unknown event_type %', p_event_type;
  END IF;

  -- Server-derived, whitelisted metadata (never trust the client).
  SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_uid;
  IF v_participant IS NOT NULL THEN
    SELECT COALESCE(cp.creator_name, p.full_name) INTO v_creator_name
      FROM profiles p LEFT JOIN creator_profiles cp ON cp.user_id = p.id WHERE p.id = v_participant;
  END IF;
  IF p_event_type = 'paid' THEN
    SELECT amount INTO v_amount FROM payment_events
      WHERE campaign_id = p_campaign_id AND event_type ILIKE '%payout%'
      ORDER BY created_at DESC LIMIT 1;   -- adjust column/type per payment_events (Task 0)
  END IF;

  INSERT INTO crew_activity (group_id, campaign_id, actor_id, participant_id, event_type, visibility, metadata)
  VALUES (v_campaign.group_id, p_campaign_id, v_uid, v_participant, p_event_type, v_visibility,
          jsonb_strip_nulls(jsonb_build_object(
            'campaign_title', v_campaign.title,
            'creator_name', v_creator_name,
            'amount', v_amount)))
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object(
    'id', v_row_id, 'group_id', v_campaign.group_id, 'owner_id', v_campaign.user_id,
    'participant_id', v_participant, 'event_type', p_event_type,
    'campaign_id', p_campaign_id, 'campaign_title', v_campaign.title,
    'creator_name', v_creator_name, 'amount', v_amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_crew_activity(uuid, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.record_crew_activity(uuid, text) TO authenticated;
```
> The RPC bodies (`payment_events` amount column, `campaign_collaborations` shape) must be reconciled against the real schema during Task 0/2 — the above is the contract, adjust field names to match.
- [ ] **Step 2:** Sanity-check. Do NOT apply yet.
- [ ] **Step 3:** Commit.

---

## Task 3: Pure notification map (TDD)

**Files:** Create `src/lib/crews/crewActivityNotifications.ts` + `.test.ts`

The RPC returns *facts*; this pure module maps `(event_type, facts)` → the `create-notification` payloads to fire (the §5 "ADDS" column, per the Task-0-verified overlap). Keeping it pure makes the fan-out unit-testable and encodes the de-dup as a static decision.

- [ ] **Step 1: Write failing tests** — assert the ADDS per event from the Task-0 table. E.g. `hired` → `[{recipientId: participant_id, type:'campaign_hired', category:'campaigns', email:true}]`; `content_approved` → `[]` (row only); `campaign_posted` → `[]` (v1 bell already sent; email handled by the mapping, not a new payload); and that no payload ever targets a non-owner/non-participant recipient (no cross-creator leak).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `crewActivityNotifications(facts): NotificationPayload[]` — a switch over `event_type` returning the exact ADDS list (recipientId ∈ {owner_id, participant_id}, type/category/emailData per §5+§8). Pure, no I/O.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit.

---

## Task 4: `recordCrewActivity` wrapper

**Files:** Create `src/lib/crews/recordCrewActivity.ts`

- [ ] **Step 1: Implement** `recordCrewActivity(campaignId: string, eventType: CrewEventType): Promise<void>`:
  - `const { data: facts } = await supabase.rpc('record_crew_activity', { p_campaign_id, p_event_type });`
  - if `!facts` → return (non-crew campaign, RPC no-op'd).
  - `for (const p of crewActivityNotifications(facts)) supabase.functions.invoke('create-notification', { body: p }).catch(console.error);`
  - Fire-and-forget; never throw into the caller (best-effort fan-out, per spec R1). Invalidate `['crew-activity']`/`['my-crew-activity']` query keys.
- [ ] **Step 2:** `npm run typecheck` (needs regenerated types incl. the RPC — see Task 9 ordering; until then use a narrow local type for `facts`). Build clean.
- [ ] **Step 3:** Commit.

---

## Task 5: Instrument the lifecycle sites

**Files (Modify):** `useCreateApplication.ts`, `useManageApplication.ts`, `useProjectComplete.ts`, the content submit/approve/revision hook (Task 0), `useCampaignCreator.ts`.

- [ ] For each site, after the existing success/notification logic, add one call gated only by the RPC's own `group_id` no-op:
  - `useCreateApplication` onSuccess → `recordCrewActivity(campaignId, 'application_received')`.
  - `useManageApplication` accept path → `recordCrewActivity(campaignId, 'hired')`.
  - content submit → `'content_submitted'`; approve → `'content_approved'`; revision → `'revision_requested'`.
  - `useProjectComplete` completion → `'completed'`; payout-success branch → `'paid'`.
  - `useCampaignCreator` crew launch (already fires `group_campaign_posted`) → `recordCrewActivity(campaignId, 'campaign_posted')` (writes the row; the pure map returns no new bell).
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

- [ ] **CrewActivityFeed** — renders a list of activity rows: an icon per `event_type`, a one-line summary built from `metadata` (`{creator_name} was hired for {campaign_title}`, `New content submitted for {campaign_title}`, `{campaign_title} paid`, etc.), relative time, and a link to the campaign/proposals. Loading/empty/error. Pure presentational (takes `items`).
- [ ] **Business — `CreatorGroupDetailPage`:** add an "Activity" tab/section using `useCrewActivity(id)` → `CrewActivityFeed`.
- [ ] **Creator — `CreatorCampaignMarketplace` Crews tab:** add a compact activity strip using `useMyCrewActivity()` → `CrewActivityFeed` (condensed), above the crew campaigns.
- [ ] Build/typecheck clean; `dc-*` tokens, both viewports. Commit.

---

## Task 8: High-signal email

**Files (Modify):** `src/types/notifications.ts`, `supabase/functions/create-notification/index.ts`, `supabase/functions/send-notification-email/index.ts`

- [ ] Add the high-signal crew types to `NOTIFICATION_TYPE_TO_EMAIL_TYPE` (both the edge fn and the mirrored `src/types/notifications.ts`) mapping to crew email templates (or the closest existing template). Only the §5 email-flagged events (`campaign_posted`, `application_received`→owner, `hired`→creator, `content_submitted`→owner, `completed`→owner, `paid`→creator). Category per §8.
- [ ] Add the crew email template(s) to `send-notification-email` (subject/body per event; reuse the closest existing template shape). Keep additive; watch the template-literal-backtick Deno-bundle hazard.
- [ ] Build clean. Commit. (Deploy in Task 9.)

---

## Task 9: Deploy + verify (checkpoint)

- [ ] **Apply** Task 1 + Task 2 migrations to prod via MCP (table → RPC). Run `get_advisors(security)` — confirm the RPC is not anon-executable, `search_path` set, `crew_activity` RLS present + no anon leak. Regenerate `src/integrations/supabase/types.ts`; fix any narrow local types from Task 4.
- [ ] **Deploy** `create-notification` + `send-notification-email` (run `edge-function-reviewer` first; preserve each `verify_jwt`; MCP `list_edge_functions` is ground truth).
- [ ] **Forge test (SQL, rolled back):** as a non-owner member, `record_crew_activity(<crew campaign>, 'paid')` must RAISE `unauthorized`; as owner it succeeds. As the applicant, `'application_received'` succeeds; as a different member it RAISEs. Confirm no `crew_activity` row persists after rollback.
- [ ] **Two-creator crew test (spec §11.2):** owner posts a crew campaign → both members get `campaign_posted` (bell + email) + see it; A applies → owner sees `application_received` (feed + bell/email), **B sees nothing**; hire A → A gets `hired`, B doesn't; A submits → owner sees `content_submitted`, B doesn't; complete + pay → owner + A see `completed`/`paid`, B doesn't.
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
- **Deferred (NOT now):** crew chat; org-team fan-out (other `org_members`); digest email; realtime feed; reactions/read-receipts; global all-crews activity page.
