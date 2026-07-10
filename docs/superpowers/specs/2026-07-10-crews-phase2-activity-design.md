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
keeps the feed and the notifications consistent — one code path emits both (mirrors the platform's
`create-notification` / `aios-report-ingest` choke-point discipline). Caveat: because the choke point
runs client-side at the lifecycle sites (§4a), a client that dies mid-flow can leave the standard
notice sent but no `crew_activity` row — a **missing feed row, not a correctness bug** (see R1/R2); it
is not a hard transactional guarantee.

### 4a. The choke point — a forge-proof RPC + a thin frontend wrapper

Every crew event flows through **one path**, split for security:

- **`record_crew_activity(p_campaign_id, p_event_type)`** — a SECURITY DEFINER Postgres RPC (see §6)
  that does the **authoritative, forge-proof half**: no-op if `group_id IS NULL`; per-event-type
  authorization on `auth.uid()`; server-derives `visibility` / `participant_id` / `metadata` from
  trusted rows; **inserts the `crew_activity` row**; and RETURNS the computed **audience descriptor**
  (recipient user_ids + which are high-signal-email + the notification body fields).
- **`recordCrewActivity(campaignId, eventType)`** — a thin frontend wrapper called at each lifecycle
  site. It calls the RPC, then fires `create-notification` per the returned audience (the §5 "ADDS"
  column). The row is authoritative; the fan-out is best-effort (a dropped notification is a
  missing-notice, not a data-integrity or security issue — the standard-path notices still fire).

Why this split: the **write** (row + metadata + amounts) must be un-forgeable, so it lives in the RPC
where `auth.uid()` and DB truth are enforced; the **fan-out** reuses the existing client-callable
`create-notification` choke point, so **no new edge function** is needed (only the §8 email-mapping
change). The audience/visibility rules also live as a **pure, unit-tested module** whose logic the RPC
and the tests share (the RPC is the enforcement point; the module documents/derives the mapping).

Instrumentation: add one `recordCrewActivity(campaignId, eventType)` call at each existing lifecycle
site (apply / accept / content submit / approve / revision / complete), gated implicitly by the RPC's
`group_id` no-op. Payout fires from the `release-creator-payout` edge fn (server-side); v1 records the
`paid` event from `useProjectComplete`'s post-payout success branch to stay frontend-only (R2).

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

### Fan-out rules (asymmetric) + de-dup delta

Two facts must be reconciled per event: (a) what the **standard lifecycle already notifies today**, and
(b) what `recordCrewActivity` must **add** (the crew_activity row is *always* written; only *new*
recipients/emails are sent). The de-dup is a **static, per-event decision baked into the pure audience
module** (unit-tested) — NOT a runtime `push_notifications` lookup. The table below is authoritative;
the "Adds" column is exactly what `recordCrewActivity` emits.

| event | crew_activity.visibility | participant_id | Standard path already sends | **recordCrewActivity ADDS** |
|---|---|---|---|---|
| `campaign_posted` | crew | — | v1 `group_campaign_posted` bell → active members | **Nothing new** — REUSE the v1 `group_campaign_posted` notice (add its email mapping in §8 + write the row). No second bell. |
| `application_received` | business | applicant | owner bell (via `useCreateApplication`) | row + **email to owner** (upgrade the existing owner bell to email); applicant sees it via own-row RLS (no new bell) |
| `hired` | business | hired creator | owner + creator bells (standard accept) | row + **email to hired creator** |
| `content_submitted` | business | creator | owner bell (content submit) | row + **email to owner** |
| `content_approved` | business | creator | owner + creator bells | row only |
| `revision_requested` | business | creator | owner + creator bells | row only |
| `completed` | business | creator | owner + creator bells (`project_completed`) | row + **email to owner** |
| `paid` | business | creator | creator bell (payout) | row + **email to creator** |

Creators never receive another creator's event — a `business`-visibility event's *added* recipients are
only the **owner** and/or the **participant** (their own event). "email to owner/creator" means: ensure
the high-signal email fires for that recipient (wire the type in §8), reusing the existing bell if one
already fired rather than sending a duplicate bell. **The plan's first step is to verify this overlap
table against the actual current `create-notification` call sites** and correct any cell before coding.

## 6. RLS & privacy

### SELECT
`crew_activity` has **SELECT-only** RLS for clients (no client INSERT/UPDATE/DELETE policy at all):
- **owner:** `is_creator_group_owner(group_id, auth.uid())` — all rows for crews they own.
- **creator:** `(visibility = 'crew' AND is_active_group_member(group_id, auth.uid())) OR (participant_id = auth.uid())`.
  **Parenthesize exactly as shown** — `(crew AND member) OR participant` — so a creator keeps sight of
  their own `business`-visibility rows (`hired`/`paid`/…) via the `participant_id` branch. (Do NOT write
  `crew AND (member OR participant)`.)

### Write path — forge-proof by construction
Writes go through **one SECURITY DEFINER RPC** `record_crew_activity(p_campaign_id uuid, p_event_type text)`.
The client passes **only** the campaign + event type — never `visibility`, `participant_id`, `metadata`,
or amounts. The RPC:
1. Loads the campaign; **returns silently if `group_id IS NULL`** (no-op off the crew path).
2. Enforces a **per-event-type authorization matrix** on `auth.uid()` (who may legitimately emit each
   event — reject otherwise):

   | event_type | who may emit (`auth.uid()` must be…) |
   |---|---|
   | `campaign_posted` | the crew **owner** (`is_creator_group_owner`) |
   | `application_received` | the **applicant** (an active member who just applied — verified against `campaign_applications`) |
   | `content_submitted` | the **participant creator** (has the active collaboration) |
   | `hired` / `content_approved` / `revision_requested` / `completed` | the crew **owner** |
   | `paid` | the crew **owner** (the party who triggers/confirms payout) |

3. **Re-derives everything server-side** from trusted rows: `visibility` (per §5), `participant_id`
   (the actual `campaign_applications`/`campaign_collaborations.creator_id`), and `metadata` (campaign
   title, the participant's *public* display name, and amounts **only** by reading `payment_events`/
   the collaboration — never a client-supplied number). The RPC persists only this **whitelisted**,
   server-built metadata — arbitrary client jsonb is impossible.
4. Inserts the row and **RETURNS the computed audience descriptor** (recipient user_ids + high-signal
   email flags + body fields). The RPC does **not** call the edge fn itself (Postgres → edge-fn
   invocation is unavailable/dead here); the thin frontend wrapper (§4a) fires `create-notification`
   per the returned audience. The row write + authz + metadata are the forge-proof part; the fan-out is
   best-effort.

So a crew member cannot forge a fake `paid`/`hired` row, a bogus amount, or another creator's event —
the RPC rejects the event_type they're not authorized to emit and never trusts client-supplied fields.
(`revoke execute from anon`; grant `authenticated`. Any purely server-side emitter — e.g. a future
edge-fn payout hook — uses the service-role client and bypasses the RPC's `auth.uid()` gate.)

### Metadata privacy
`metadata` carries only audience-safe fields (public display name; amounts only on `business`-visibility
rows the owner/participant may see). Combined with the SELECT RLS, no creator ever sees another
creator's rate/content/earnings.

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
`notification_preferences` category toggle.

**Category per crew type** (reuse the existing category set — no new `crew` category, YAGNI): the
`notification_preferences` category gates the email, so pin each type: `campaign_posted` /
`application_received` / `hired` → **`campaigns`**; `content_submitted` → **`content`**;
`completed` / `paid` → **`transactions`**. (These match the categories the standard lifecycle already
uses for the same events, so a user's existing toggles apply consistently.)

**This is the one part that requires an edge-fn deploy** (`create-notification` + `send-notification-email`)
— everything else is DB + frontend. Run `edge-function-reviewer` before deploy; preserve each fn's
`verify_jwt`.

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
