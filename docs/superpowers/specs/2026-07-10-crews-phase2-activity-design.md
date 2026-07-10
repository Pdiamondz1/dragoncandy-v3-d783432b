# Crews Phase 2 — Crew Activity & Team Notifications — Design

> Status: approved design (brainstorming). Next: spec review → implementation plan.
> Date: 2026-07-10 · Branch: `feat/crews-phase2-activity`
> Builds on: `docs/wiki/concepts/creator-groups.md` (Crews v1, PR #226).

## 1. Problem & goal

Crews v1 (PR #226) shipped a **roster + private free-campaign distribution** with three crew-specific
in-app pings (`group_invitation`, `group_campaign_posted`, `group_invite_accepted`). But the founder's
purpose for Crews is broader: a business and its creators should **engage over campaigns quickly and be
notified on transactions / requests / content updates in a team-oriented way** — not just the isolated
per-individual notifications every campaign already fires.

Today a crew campaign, once a member is hired, runs through the **standard** lifecycle, so its events
(application received, hired, content submitted, approved, revision requested, completed, paid) notify
only the **two individuals** in that one collaboration — there is no crew-level, team-oriented view or
fan-out.

**Goal:** a **Crew Activity** layer — a shared, role-scoped activity feed **plus** team-oriented
notification fan-out on crew-scoped campaign lifecycle events — so the business sees its crew's whole
campaign pipeline in one place and the right people are notified (bell + high-signal email), without
leaking creators' private rates/content/earnings to each other.

## 2. Confirmed scope decisions (from brainstorming)

- **Deliverable:** team notifications **+** a Crew Activity feed. (Crew *chat* is out of scope — it can
  extend the existing `conversations` messaging system in a later phase.)
- **Fan-out privacy = asymmetric by role:** the **crew owner** (business) sees the full crew pipeline;
  **creators** see crew-level events (`campaign_posted`) + their **own** participation, never other
  creators' private data.
- **Business audience v1 = the crew owner only** (the `creator_groups.owner_id` business user).
  Org-team fan-out (other `org_members`) is a documented fast-follow.
- **Email = high-signal per-event only** (bell stays on for everything), via the existing
  `create-notification` → `notification_preferences` path — no digest system.

## 3. Current state (verified)

- **Notifications choke point:** `create-notification` edge fn inserts into `push_notifications`
  (bell) and, when `notification_preferences` allow, invokes `send-notification-email` — but ONLY for
  types mapped in `NOTIFICATION_TYPE_TO_EMAIL_TYPE` (or an explicit `emailType`). The crew types
  (`group_*`) are **not** mapped → bell-only today.
- **`push_notifications` is prunable** (`clean_stale_data` deletes old rows) — so it's the wrong
  durable source for an activity feed.
- **Lifecycle events already fire `create-notification`** from scattered sites: `useCreateApplication`
  (application received), `useManageApplication` / `accept_application_with_collaboration` (hired),
  content submit / approve / revision (collaboration `content_status`), `useProjectComplete`
  (completed), payout (`release-creator-payout`). Categories in use: `campaigns`, `content`,
  `transactions`, `messages`, `deliverable`.
- **Crews v1 primitives:** `creator_groups` (owner = business user), `creator_group_members`
  (active membership), `campaigns.group_id`, `is_active_group_member` / `is_creator_group_owner`
  (SECURITY DEFINER). The crew feed/RLS reuses these.
- **Surfaces to extend:** business crew detail page `src/pages/CreatorGroupDetailPage.tsx`; creator
  "Crews" tab in `src/pages/CreatorCampaignMarketplace.tsx`.

## 4. Chosen approach

**A dedicated `crew_activity` event log written through ONE choke point** that also fans out the
notifications. Rejected alternatives: (a) **derive the feed from `push_notifications`** — no new table,
but retention-pruned and a per-recipient notice list is the wrong shape for the business's event-centric
pipeline; (b) **derive from source tables** (applications/collaborations/payments) — a messy
multi-table union, and content submit/approve/revision are `content_status` transitions, not discrete
rows. The dedicated log is clean, durable, paginatable, and role-filterable, and the single choke point
guarantees the feed and the notifications can never drift (mirrors the platform's `create-notification`
/ `aios-report-ingest` choke-point discipline).

### 4a. `recordCrewActivity` choke point

A shared helper — **one code path** every crew event flows through. Given a lifecycle event
`{ group_id, campaign_id, actor_id, event_type, participant_id?, metadata? }`:
1. No-op if the campaign is not a crew campaign (`group_id IS NULL`) — so instrumentation is inert on
   the public/paid path.
2. Insert one `crew_activity` row (with the computed `visibility`).
3. Fan out `create-notification` to the audience per §5, with email on for the high-signal subset.

Implementation seam: a pure `_shared`-style module for the audience/visibility/summary logic (unit
tested), plus the DB insert + notification invokes. It runs from the **frontend** at the existing
lifecycle sites (where `create-notification` is already called) — one `recordCrewActivity(...)` call
added per site — because those sites already have the campaign + actor context and already fire
notifications. (Payout, which fires from the `release-creator-payout` edge fn, is the one server-side
site; v1 records the `paid` activity from `useProjectComplete`'s post-payout success path to stay
frontend-only and avoid an edge-fn change there.)

## 5. Data model & fan-out

### `crew_activity` (new table)
```
id            uuid pk
group_id      uuid  → creator_groups(id) on delete cascade
campaign_id   uuid  → campaigns(id) on delete cascade
actor_id      uuid  → profiles(id)          -- who did it
participant_id uuid → profiles(id) null      -- the creator the event concerns (if any)
event_type    text  check in (campaign_posted, application_received, hired,
                               content_submitted, content_approved, revision_requested,
                               completed, paid)
visibility    text  check in ('business','crew')   -- 'crew' = campaign_posted (all active members); 'business' = owner-only
metadata      jsonb                                  -- title, creator display name, amount, etc. (NO raw rates/PII beyond what the audience may see)
created_at    timestamptz default now()
```
Indexes: `(group_id, created_at desc)`, `(participant_id)`.

### Fan-out rules (asymmetric)
| event | crew_activity.visibility | bell recipients | email (high-signal) |
|---|---|---|---|
| `campaign_posted` | crew | all active members | ✔ members |
| `application_received` | business | owner | ✔ owner |
| `hired` | business | owner + the hired creator | ✔ hired creator |
| `content_submitted` | business | owner | ✔ owner |
| `content_approved` | business | owner + creator | — |
| `revision_requested` | business | owner + creator | — |
| `completed` | business | owner + creator | ✔ owner |
| `paid` | business | owner + creator | ✔ creator |

Creators never receive another creator's `application_received` / `content_submitted` etc. — a
`business`-visibility event notifies the **owner**, and additionally the **participant** creator for
their *own* hired/approved/revision/completed/paid events. (Several of these owner/participant bells
already fire today via the standard lifecycle; `recordCrewActivity` de-dupes by not re-sending a notice
the standard path already sent — v1 keeps it simple: the standard per-collaboration notices remain, and
`recordCrewActivity` adds the crew_activity row + only the *new* recipients/emails not already covered.
See Risk R3.)

## 6. RLS & privacy

- `crew_activity` RLS SELECT:
  - **owner** sees all rows for crews they own: `is_creator_group_owner(group_id, auth.uid())`.
  - **creator** sees rows where `visibility='crew' AND is_active_group_member(group_id, auth.uid())`
    OR `participant_id = auth.uid()`.
  - No INSERT/UPDATE/DELETE policy for clients — rows are written only by the `recordCrewActivity`
    path (service-role or a SECURITY DEFINER RPC gated on ownership/membership + `group_id IS NOT NULL`
    + actor legitimacy). This keeps the activity log tamper-proof from the client.
- `metadata` carries only what the audience is allowed to see (e.g. the creator's *public* display name;
  amounts only on `business`-visibility events the owner/participant may see). No cross-creator rate leak.

## 7. Feed surfaces (reuse existing pages)

- **Business — `CreatorGroupDetailPage`:** a new "**Activity**" section/tab listing `crew_activity`
  for that crew (newest first, paginated), each row a compact "actor · event · campaign · time" line
  with an action link to the campaign/proposals. Hook `useCrewActivity(groupId)`.
- **Creator — Crews tab (`CreatorCampaignMarketplace`):** a compact **crew-activity strip** above/among
  the crew campaigns showing the creator-visible events (new campaigns + their own participation).
  Hook `useMyCrewActivity()`.
- Loading/empty/error states; `dc-*` tokens, no gray; desktop `lg:` + mobile base.

## 8. Email

Wire the high-signal crew event types into `NOTIFICATION_TYPE_TO_EMAIL_TYPE` (in `create-notification`
+ the mirrored `src/types/notifications.ts`) → a small set of crew email templates in
`send-notification-email` (or reuse the closest existing templates). Respects each user's
`notification_preferences` category toggle. **This is the one part that requires an edge-fn deploy**
(`create-notification` + `send-notification-email`) — everything else is DB + frontend. Run
`edge-function-reviewer` before deploy; preserve each fn's `verify_jwt`.

## 9. Scope / YAGNI

**In v1:** `crew_activity` table + RLS; the `recordCrewActivity` choke point + instrumentation at the
existing lifecycle sites; the two feed surfaces; high-signal email for crew types.
**Explicitly deferred:** crew chat; org-team fan-out (other `org_members`); a digest email; reactions/
read-receipts on the feed; a global "all my crews" activity page; realtime feed (v1 is
query-on-load + invalidate).

## 10. Risks / edge cases

- **R1 — instrumentation completeness:** the feed is only as complete as the sites that call
  `recordCrewActivity`. Enumerate the lifecycle sites up front; a missed site = a missing feed row (not
  a correctness bug). Gate every call on `campaign.group_id` so it's a no-op for non-crew campaigns.
- **R2 — payout is server-side** (`release-creator-payout`): v1 records `paid` from
  `useProjectComplete`'s post-payout success branch (frontend) to avoid an edge-fn change; if that
  branch can be bypassed, `paid` activity may be missed (acceptable v1 gap; note it).
- **R3 — notification de-dup:** the standard lifecycle already sends some owner/participant bells.
  `recordCrewActivity` must NOT double-notify — v1 rule: it always writes the `crew_activity` row, but
  only *sends* the notifications the standard path doesn't already send (new recipients / crew email).
  Spec the per-event overlap explicitly in the plan.
- **R4 — email deploy:** editing `create-notification`/`send-notification-email` is the only prod-deploy
  surface; keep the change additive (new type→template entries), reviewer + verify_jwt discipline.
- **R5 — privacy:** `metadata` and `visibility` must never expose a creator's rate/content/earnings to
  other creators. RLS + a metadata whitelist enforce this; test with a two-creator crew.
- **R6 — retention:** `crew_activity` should be covered by a retention policy eventually (like
  analytics); v1 leaves it unbounded (low volume pre-scale) and notes it.

## 11. Verification (end-to-end)

1. Migration + RLS applied; `get_advisors(security)` clean; the write path is service-role/definer-only.
2. **Two-creator crew test:** owner posts a crew campaign → both members get `campaign_posted` (bell +
   email) and see it in the feed. Creator A applies → **owner** sees `application_received` in the feed +
   bell/email; **creator B does NOT** see it anywhere. Owner hires A → A gets `hired`; B doesn't. A
   submits content → owner sees `content_submitted`; B doesn't. Complete + pay → owner + A see
   `completed`/`paid`; B doesn't.
3. Business feed shows the full pipeline for the crew; creator strip shows only creator-visible rows.
4. Non-crew (public/paid) campaigns: `recordCrewActivity` is a no-op; zero `crew_activity` rows; the
   paid/public path is unchanged.
5. Email lands only for the high-signal set and respects `notification_preferences`.
6. `npm run build` / `typecheck` / vitest for the pure audience/visibility helper; Codex + independent
   review; `verify-prod` post-deploy.
