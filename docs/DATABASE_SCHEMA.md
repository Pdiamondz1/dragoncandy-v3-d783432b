# Supabase Database Schema

## Key Relationships

* `profiles` is the central user table — always join through here for user info
* `campaigns` → `campaign_applications` → `campaign_collaborations` is the core marketplace flow
* `conversations` + `conversation_participants` + `messages` power the chat system
* `file_uploads` are the primary content deliverable mechanism between creators and brands

> **`updated_at` is NOT trustworthy on ~30 tables — `handle_updated_at()` is a stub.** The shared
> trigger function's entire body is `-- Function logic here` / `RETURN NEW;`. It never assigns
> `NEW.updated_at`, so every trigger wired to it fires and changes nothing. Confirmed on prod
> 2026-08-07 by direct observation: a `donny_knowledge` row's content was replaced while its
> `updated_at` stayed **equal to its `created_at`** from 78 minutes earlier. Affected tables
> include `campaigns`, `campaign_applications`, `campaign_collaborations`, `conversations`,
> `internal_docs`, `donny_knowledge`, `organizations`, `org_units`, `creator_groups`,
> `package_orders`, `user_presence` and the `aios_*` set. **Never use `updated_at` (or
> `max(updated_at)`) as a freshness/recency signal on these** — verify by content, or use a
> purpose-built anchor column stamped by its own trigger, the way
> `campaign_collaborations.content_submitted_at` exists precisely because this one is a no-op
> (see the Creator Groups Phase 2 note below). A table listed here may still have a *second*,
> working trigger or an explicit application-level set — confirm before relying on it either way.
> Enumerate the affected set with:
> `select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where p.proname='handle_updated_at' and not t.tgisinternal;`

## User & Auth

| Table | Purpose |
|-|-|
| `profiles` | Core user profiles (linked to Supabase auth). Includes `first_run_missions` JSONB for onboarding state. |
| `creator_profiles` | Extended profile data for content creators |
| `business_profiles` | Extended profile data for brands/businesses |
| `profile_views` | Tracks who viewed which profiles |
| `onboarding_steps` | Defines onboarding flow steps |
| `user_onboarding_progress` | Tracks per-user onboarding completion |
| `email_verification_tokens` | Email verification flow |
| `feature_flags` | Per-user or global feature toggles |
| `user_roles` | RBAC role assignments (`app_role` enum). Queried via the `has_role()` security-definer function so RLS policies stay non-recursive. |

## Campaigns & Marketplace

| Table | Purpose |
|-|-|
| `campaigns` | Brand-created campaigns seeking creators |
| `campaign_applications` | Creator applications to campaigns |
| `campaign_collaborations` | Active collaborations between brands and creators |
| `campaign_invitations` | Direct invites from brands to creators. **A creator's UPDATE is decline-only (2026-08-08).** See the invitation-integrity note below. |
| `campaign_matches` | Matched brand/creator pairings |
| `campaign_sponsorships` | Sponsorship arrangements within campaigns |
> **Invitation & application integrity — migrations `20260808010000` + `20260808020000`, applied
> and proven red→green on prod 2026-08-08.** Two live holes, both demonstrated by impersonating a
> real user inside a rolled-back transaction (never assumed):
>
> 1. **`campaign_invitations` UPDATE had `USING (auth.uid() = creator_id)` and NO `WITH CHECK`.**
>    Postgres defaults an omitted `WITH CHECK` to the `USING` expression, so `creator_id` *was*
>    pinned (reassignment blocked — verified) — but nothing else was. A creator could **forge
>    `status='accepted'`** without applying (making the owner's card read "Applied — review them"
>    with no application behind it) and could **repoint the row at another `campaign_id`**, which
>    manufactures apply rights because an *invited* creator may apply to a campaign that has left
>    `published`. Now: policy `USING (creator AND status='pending')` / `WITH CHECK (creator AND
>    status='declined')`, **plus** `revoke update … from authenticated, anon` then
>    `grant update (status) to authenticated` — because RLS `WITH CHECK` sees only the NEW row
>    (there is no `OLD` in a policy), so "campaign_id must not change" is inexpressible as a policy
>    and column privileges are the correct tool. The migration self-asserts the resulting grant set
>    is exactly `authenticated:status`, and the filter includes **`PUBLIC`** — a table-wide
>    `GRANT … TO PUBLIC` is recorded under that grantee, so omitting it would make the assertion
>    unfailable. The one legitimate client write, `useDeclineInvitation`, still works.
> 2. **`apply_to_campaign` checked eligibility ONLY on the `group_id IS NOT NULL` branch.** For an
>    ordinary campaign it fell through to the INSERT with no status and no role check, and being
>    `SECURITY DEFINER` it bypassed the `campaign_applications` INSERT policy that carries exactly
>    those rules via `can_create_application`. Proven: a creator with no invitation applied to an
>    **`active`** campaign. The non-group branch now calls `can_create_application` itself — the
>    same predicate as the policy, not a re-invented one — OR-ed with "an existing non-`rejected`
>    application", because the RPC is an upsert and that is how counter-offers amend a row the
>    creator already legitimately holds. `anon` EXECUTE revoked (it was already stopped by the
>    `auth.uid()` guard). Verified after: applying to a closed campaign now raises *"Not eligible
>    to apply to this campaign"*, applying to a published one still succeeds.
>
> **Lesson worth keeping: a `SECURITY DEFINER` RPC silently opts out of the RLS policy protecting
> the table it writes.** Whenever one exists, check that it re-asserts the policy's predicate —
> here the policy was correct the whole time and the RPC simply never consulted it.

| `application_counter_offers` | Negotiation counter-offers on applications. Written via the `create_counter_offer` SECURITY DEFINER RPC (authorization-hardened 2026-07-20: identity + participant + role-integrity guards, writes the server-derived `sender_id`/`sender_role`, `anon` EXECUTE revoked) or the direct-insert apply-time path; the INSERT RLS policy pins `sender_role` to the caller's derived role. See [[Service-Role Data Exposure]]. |
| `content_disputes` | Dispute record opened when a business rejects content after max revisions (`reject-content` inserts `collaboration_id`/`initiated_by`/`reason`, `status=open`) and resolved by `resolve-dispute` (`status=resolved`, `outcome ∈ refund/partial_payment/approved`). Participant-SELECT RLS (creator or campaign owner) + a service-role FOR-ALL policy. **Restored to prod 2026-07-23 (PR #325)** — it, and the whole collaboration state machine, were recorded in `schema_migrations` but MISSING from prod (see below). |

> **Collaboration state machine (`campaign_collaborations.content_status`) — restored 2026-07-23
> (PR #325, [[Content Delivery State Machine]]).** The `20260425000000_collaboration_state_machine`
> migration was recorded as applied but its objects were absent from prod (`recorded ≠ actual`):
> the `transition_content_status(p_collaboration_id, p_new_status, p_actor_id, p_reason)` RPC
> (SECURITY DEFINER, **service-role-only** — `REVOKE`d from `public/anon/authenticated` to close a
> cross-actor IDOR; `service_role` keeps its own direct grant), `content_disputes`, the
> `enforce_revision_limit` + `recompute_final_approval` triggers, `increment/decrement_budget_spent`
> + **`campaigns.budget_spent`**, and the expanded 9-value `content_status` CHECK
> (`pending/in_progress/submitted/revision_requested/approved/auto_approved/rejected/disputed/resolved`)
> were all re-created idempotently. **Auto-approval** (`auto-approve-content` cron) now times the
> review window off **`content_submitted_at`** (the `set_content_submitted_at` trigger-stamped anchor),
> NOT `submitted_at` (which the client submit paths never set) — and is finally scheduled
> (`pg_cron` job `auto-approve-content`, `*/15`). Verify object existence directly (`pg_proc` /
> `information_schema` / `pg_trigger`), not just `schema_migrations`.

> **Payout durable re-entrancy (`release-creator-payout`) — 2026-07-23, [[Payout Finalization & Re-entrancy]].**
> `campaign_collaborations` gained two nullable columns: **`payout_executed_at timestamptz`** and
> **`stripe_transfer_id text`** (migration `20260723160000`). `payout_executed_at` is the **durable
> re-entry marker — set the instant money moves (Stripe transfer OR pending-balance credit), so
> "marker set ⇒ money moved" holds by construction**; `release-creator-payout`'s early guard short-circuits
> any re-invocation with the marker set to finalize-only (no re-credit / re-transfer). The pending-balance
> path now credits + marks atomically in **`credit_pending_balance_for_payout(p_collaboration_id, p_user_id,
> p_amount)`** (migration `20260723170000`; SECURITY DEFINER, `search_path=public`, **service-role only** —
> REVOKE public/anon/authenticated + in-body `request.jwt.claims->>'role'='service_role'` guard; row-locks
> the collaboration `FOR UPDATE`, `RAISE`s if no `creator_profiles` row or if `p_user_id` ≠ the row's
> `creator_id`), **replacing the non-idempotent `increment_pending_balance`** on this path. A `*/15`
> reconciliation sweep in `auto-approve-content` re-drives finalize-only for marked-but-unfinalized rows
> (5-min min-age guard).

> **Durable pending-balance flush ledger (`pending_balance_flushes`) — 2026-07-24, [[Payout Finalization &
> Re-entrancy]] (stage 1 of the wallet-first fix).** New table **`pending_balance_flushes`** (migration
> `20260723180000`) makes the shared wallet→Stripe flush (`_shared/flush-pending-balance.ts`)
> **exactly-once**: one row per flush, whose id **is** the Stripe idempotency key `flush_${id}` — replacing
> the colliding `withdraw_${user}_${cents}` key that under-paid two identical-cents flushes. Columns: `id`,
> `user_id` (FK `auth.users` ON DELETE CASCADE), `profile_type` (`creator`/`business`), `stripe_account_id`,
> `amount_cents`, `source` (`manual`/`autoflush`), `status` (`claimed`/`succeeded`/`failed`/`stuck`),
> `stripe_transfer_id`, `attempts`, `last_error`, `created_at`/`updated_at`. Partial index
> `idx_pbf_claimed_created ON (created_at) WHERE status='claimed'` (the only rows the reconcile scan reads).
> RLS: internal-`SELECT` (`is_internal_user()`) + service-role `FOR ALL`; **no client write path** — all
> writes go through four SECURITY DEFINER, `search_path=public`, **service-role-only** RPCs (in-body
> `request.jwt.claims->>'role'='service_role'` guard + REVOKE public/anon/authenticated + GRANT service_role,
> same lockdown as `credit_pending_balance_for_payout`): **`claim_pending_balance_flush`** (row-locks the
> profile `FOR UPDATE`, verifies `round(pending_balance*100)=cents`, zeroes the balance, inserts a `claimed`
> row → its id; NULL on mismatch/no-row ⇒ caller throws `BALANCE_CHANGED`), **`confirm_pending_balance_flush`**
> (`claimed→succeeded` + records the transfer id; **`RETURNS boolean`** = did *this* call transition the row,
> so an overlapping reconcile whose `confirm` is a no-op skips the duplicate ledger write — migration
> `20260723200000`), **`fail_pending_balance_flush`** (`claimed→failed`; if
> restore, adds back exactly `amount_cents::numeric/100` — the `::numeric` cast avoids an integer floor to 0),
> **`bump_flush_attempt`** (increments `attempts`; flips `claimed→stuck` at the cap; returns `'stuck'` on
> **exactly** the transition, giving file-once alerting). Re-driven by the new **`reconcile-pending-flushes`**
> edge fn on a `*/15` pg_cron (migration `20260723190000`; `verify_jwt=false` + `isAuthorizedIngest`, Vault
> `reconcile_pending_flushes_url` URL + shared `aios_ingest_key` bearer — mirrors `auto-approve-content`),
> which scans `claimed` rows >5 min old through the shared `executeFlushTransfer`. Stage 2 (the
> `release-creator-payout` onboarded-path reroute) is deferred.

## Creator Groups (Crews)

A business's standing private roster of creators; a campaign scoped to a crew is visible only to its
active members, who one-tap apply with no payment (free `fixed_price=0`). See
`docs/wiki/concepts/creator-groups.md`. All `user_id`/`owner_id`/`creator_id` reference `profiles(id)`
(consumer feature). Crews are anchored on the **business user** (`owner_id = auth.uid()`), mirroring
`brand_shortlists`.

| Table | Purpose |
|-|-|
| `creator_groups` | A crew: `owner_id` (business user), `name`, `description`. Owner-manage RLS + active-member SELECT |
| `creator_group_members` | Membership with invite→accept lifecycle `status ∈ invited/active/declined/removed` (mirrors `org_members.invitation_status`), `invited_by`, `UNIQUE(group_id, creator_id)`. Owner manages; creator reads/updates own rows (accept/decline only via RPC) |
| `crew_activity` | **Phase 2** per-crew lifecycle event log (`group_id`, `campaign_id`, `actor_id`, `participant_id`, `event_type` ∈ 7 events, `visibility` ∈ `business`/`crew`, `metadata`). **SELECT-only for clients**; all writes via the `record_crew_activity` RPC. Asymmetric RLS: owner sees all (`is_creator_group_owner`); creator sees `(visibility='crew' AND is_active_group_member) OR participant_id = auth.uid()` |

> **`campaigns.group_id`** — `uuid REFERENCES creator_groups(id) ON DELETE RESTRICT` (RESTRICT, never
> SET NULL — SET NULL would flip a private campaign public). Non-null ⇒ a private crew campaign; every
> public path is gated on `group_id IS NULL`, so existing rows (all NULL) are byte-unchanged.
>
> **Functions (SECURITY DEFINER, `search_path=public`, mirror `has_collaboration_on_campaign`):**
> `is_active_group_member(group_id, creator_id)` — **stays anon-executable** (used in the
> anon-reachable `campaigns` SELECT policy); `is_creator_group_owner(group_id, user_id)`,
> `respond_to_group_invitation(group_id, accept)` (creator-only accept/decline), and
> `get_creator_pending_group_invitations()` (an invited creator reads their own pending invites WITH
> crew+business name; gated on `creator_id = auth.uid()`) — all **revoked from anon**. Trigger
> `enforce_campaign_group_ownership` (`BEFORE INSERT OR UPDATE OF group_id`) forbids targeting a crew
> the campaign owner doesn't own. Single-winner uses the existing `enforce_single_slot_campaign`, which
> reads `(ai_analysis->>'creator_count')` — there is **no top-level `campaigns.creator_count` column**.
>
> **More DB-enforced crew invariants:** `campaigns_group_free` CHECK (`group_id IS NULL OR
> COALESCE(fixed_price,0)=0` — crew campaigns are always free); `reject_group_campaign_invitation`
> (`BEFORE INSERT` on `campaign_invitations` — no invite for a crew campaign; members-only);
> `forbid_application_campaign_change` (`BEFORE UPDATE` on `campaign_applications` — `campaign_id` can't
> change, closing a raw-UPDATE injection); `cgm_owner_insert`/`cgm_owner_update` RLS restrict owner
> writes to `invited`/`removed` (activation is creator-only via `respond_to_group_invitation`). The
> generic `send-campaign-publish-notifications` edge fn early-returns for group campaigns (a private
> crew campaign is never broadcast platform-wide).
>
> **Phase 2 — crew activity + team notifications.** `record_crew_activity(p_campaign_id, p_event_type,
> p_collaboration_id?)` (SECURITY DEFINER, `search_path=public`, revoked from anon → `authenticated`)
> is the **only** writer of `crew_activity`: a per-event authz matrix on `auth.uid()`, server-derived
> `participant_id`/`visibility`/metadata, no-op (NULL) off the crew path. Idempotency is server-side —
> a **cycle anchor** `campaign_collaborations.content_submitted_at` (nullable; stamped by trigger
> `trg_set_content_submitted_at` **only on the transition into `content_status='submitted'`**, since the
> table's `handle_updated_at` trigger is a no-op so client `updated_at` is untrustworthy) suppresses a
> replayed `content_submitted` while allowing a resubmit-after-revision; **one-shot** dedup covers
> `campaign_posted`/`application_received`/`hired`/`completed`; a `pg_advisory_xact_lock` on
> `(campaign, event, participant)` makes each check-and-insert **atomic**. `completed` additionally
> requires `status='completed'`. The one emailed event is `content_submitted → owner`, pinned to
> category **`campaigns`** (so the high-signal email sends by default) via the `crew_content_submitted`
> template. See [[Creator Groups (Crews)]].

## Payments & Promotions

| Table | Purpose |
|-|-|
| `promotions` | Promotional offers or deals |
| `promotion_submissions` | Creator submissions for promotions |
| `discount_codes` | Discount/promo codes |

> **Stripe:** Payments via Stripe Connect (currently in **test mode**). Logic lives in `src/integrations/`. Never switch to live keys without explicit confirmation.

## Messaging & Realtime

| Table | Purpose |
|-|-|
| `conversations` | Conversation threads |
| `conversation_participants` | Users in each conversation |
| `messages` | Individual messages |
| `messages_with_profiles` | View joining messages with sender profile data |
| `message_reactions` | Emoji reactions on messages |
| `user_presence` | Online/offline status (realtime) |
| `push_notifications` | Push notification records |
| `notification_preferences` | Per-user notification settings |

## File Management

| Table | Purpose |
|-|-|
| `file_uploads` | Uploaded files (content deliverables, assets) |
| `file_versions` | Version history for uploaded files |
| `file_permissions` | Access control on files |
| `file_comments` | Comments on files |
| `file_tags` | Tag definitions |
| `file_tag_assignments` | Tags assigned to files |

## Reviews & Analytics

| Table | Purpose |
|-|-|
| `project_reviews` | Reviews of completed collaborations |
| `review_responses` | Responses to reviews |
| `beta_feedback` | Beta user feedback submissions |
| `analytics_events` | Custom event tracking |
| `pricing_funnel_events` | Pricing page conversion funnel tracking |

## Campaign Extensions

| Table | Purpose |
|-|-|
| `campaign_brief_generations` | AI-generated campaign briefs |
| `campaign_media` | Media assets attached to campaigns |
| `campaign_social_hooks` | Social media hooks for campaigns |
| `campaign_deliverables` | Deliverable specifications and tracking |
| `campaign_templates` | Reusable campaign templates |

## Donny AI

| Table | Purpose |
|-|-|
| `donny_actions` | Tracked Donny AI actions and their outcomes |
| `donny_campaign_previews` | Donny AI campaign preview data |
| `donny_conversations` | Donny AI conversation threads |
| `donny_messages` | Individual messages in Donny conversations. `rich_card` (jsonb, singular) + `rich_cards` (jsonb, nullable — a LIST of cards, e.g. the web-chat `find_creators` avatar cards; additive, internal Donny leaves it null) |
| `donny_help_logs` | Help requests and resolutions via Donny |
| `donny_knowledge` | Donny's knowledge base entries (RAG) |
| `donny_nudges` | Proactive nudge definitions and delivery tracking |
| `donny_tool_executions` | Tool call logs from Donny. Columns are `message_id` · `user_id` · `tool_name` · `input` · `output` · `status` (`pending`/`success`/`error`) — **not** `tool_input`/`tool_output`/`is_error`; writing those names is how `donny-orchestrator` silently logged nothing for its entire life. `message_id` is **nullable** (2026-07-18): a streaming caller has no assistant-message id at log time because the client persists the message. Read by `bug-sweep-agent` (`status=eq.error`) — note an empty table is indistinguishable from "no errors". See [[Reading Agent Traces]]. |
| `donny_oauth_clients` | OAuth client registrations for Donny API |
| `donny_oauth_codes` | OAuth authorization codes |
| `donny_oauth_tokens` | OAuth access/refresh tokens |
| `donny_scheduled_posts` | Cross-platform posting schedule (auto cross-scheduling). Per-platform caption/media/hashtags, `scheduled_at`, status lifecycle, and `ai_suggested_time`/`ai_reasoning` for Donny-proposed slots. |
| `donny_cost_ledger` | Per-call **runtime** AI-spend ledger (Donny/Dezzy generation + RAG embeddings) — the source of truth for the ≤15%-of-revenue AI kill-switch (NOT the total Anthropic/OpenAI invoice, which is mostly founder dev spend/opex). Written only by `_shared/cost-ledger.ts`. `user_id` is **nullable** (system/anonymous calls log `NULL`; the FK to `auth.users` is kept); `tier` ∈ `T0`–`T3`, `'embedding'`, or `'web_search'`/`'web_extract'` (Donny web tools — the ledger rows double as the daily web-search rate counter; see `docs/wiki/concepts/donny-web-access.md`). Summed MTD by the `aios_cost_stats()` RPC (see `docs/wiki/concepts/aios-runtime-spend-source-of-truth.md`). |

> **Strategy library (`internal_docs`)** — the AIOS strategy/wiki docs surfaced at `/internal/strategy`;
> a projection of git files synced by `donny-knowledge-sync` and the source of Donny's internal RAG
> (`donny_knowledge`, scope `internal`) + Dezzy's `get_internal_doc`. Columns: `path` (unique key),
> `title`, `content_md`, `tags`, `source_hash` (sha256 of `content_md`, for exact-dup detection), plus
> **`is_core`** (Core-File protection — seeded true on non-`docs/wiki/%` paths; a `BEFORE INSERT`
> trigger keeps future top-level docs protected) and the reversible-archive triple `archived_at` /
> `archived_by` / `archive_reason`. Internal-only `SELECT` RLS; all mutations via SECURITY DEFINER
> RPCs: `internal_doc_archive(path,reason)` / `internal_doc_unarchive(path)` (admin-gated — archive
> refuses a core doc + deletes the `donny_knowledge` row, and the archive-aware sync keeps it out of
> the RAG) and `dedup_candidate_pairs(threshold)` / `internal_doc_exact_dupes()` (service-role,
> audit-only, consumed by the monthly `strategy-library-audit-agent`).

## DragonShare

| Table | Purpose |
|-|-|
| `dragonshare_boosts` | Boost payments from restaurants to creators (Stripe Connect, 80/20 split) |
| `dragonshare_engagement` | Engagement tracking on shared content (schema only, not populated) |
| `dragonshare_events` | DragonShare lifecycle events (data flywheel for future AI training) |
| `dragonshare_payouts` | Creator payouts from DragonShare boosts |
| `dragonshare_posts` | Creator-submitted content posts. `post_url`/`platform` nullable (direct uploads). `content_file_path` for uploaded content. `flagged_at`/`flagged_by` for report mechanism. Default status: `verified` (trust-then-flag model) |

## Dragon Rewards (DRE)

Dragon Rewards Engine v1 — see `docs/wiki/concepts/dragon-rewards-engine.md`. All `user_id` FK
`profiles(id)` (consumer feature). Written only by the service-role `dre-award-engine` edge fn;
clients read their own rows (`auth.uid() = user_id`).

| Table | Purpose |
|-|-|
| `dre_config` | Admin-tunable JSONB config — `point_values`, `tier_thresholds`, `go_live_at` (retune without a deploy). Authenticated-read, `has_role('admin')`-write |
| `dragon_point_events` | Append-only Dragon Points ledger. `UNIQUE (user_id, event_type, source_id)` = idempotency key. `multiplier_applied` reserved (always `1.0` in v1) for Phase-3 boosts |
| `dragon_point_balances` | Materialized cache, recomputed from the ledger (sum). Holds `balance`, `tier`, `last_activity_at`; `streak_*`/`total_redeemed` reserved for Phases 3/5 |

> RPCs (SECURITY DEFINER, `service_role`-only): `dre_pending_events()` (anti-join — source rows
> lacking a ledger row) and `dre_user_aggregates(uuid[])` (balance + completed-campaign count +
> avg rating for tier resolution).

## Payments & Revenue

| Table | Purpose |
|-|-|
| `payment_events` | Payment lifecycle events (ledger) |
| `stripe_webhook_events` | Raw Stripe webhook event log |
| `rush_surcharge_log` | DragonDash rush surcharge records |

## Organizations

| Table | Purpose |
|-|-|
| `organizations` | Parent organization entities |
| `org_units` | Organizational units (locations/divisions) |
| `org_members` | Organization membership records |

## Account Management

| Table | Purpose |
|-|-|
| `account_deletion_requests` | User account deletion requests (GDPR) |

## Marketing & Leads

| Table | Purpose |
|-|-|
| `leads` | Public landing-page lead capture (the "Contact" form). **Private** — internal-team read/update RLS via `is_internal_user()`, and **no anon/authenticated INSERT or SELECT policy** (holds contact PII). Rows are inserted by the `capture-lead` edge function with the service-role key (bypasses RLS); the edge fn enforces a honeypot + a fail-open per-IP throttle and Resend-notifies the team. `audience` ∈ business/brand/creator/other; `status` new→contacted→qualified→…; `metadata jsonb` (user_agent, ip). |

## Synthetic Weight Engine

Safety spine for synthetic ("bot") users minted on prod (Phase 0). Kill switch
`SYNTHETIC_BOTS_ENABLED` (feature_flags, default off, fail-closed). Every synthetic row is tagged
and excluded from founder metrics + the data-flywheel moat via a two-sided **actor-OR-parent**
predicate. See `docs/wiki/concepts/synthetic-weight-engine.md`.

| Table | Purpose |
|-|-|
| `synthetic_users` | Registry of bot accounts (`user_id` PK → `auth.users` ON DELETE CASCADE, `cohort`, `persona`). Auto-filled by the extended `handle_new_user` trigger when a `bot…@synthetic.dragoncandy.test` account signs up (email is the source of truth). RLS: internal-`SELECT` only, no client write policy (writes via service_role / SECURITY DEFINER). |
| `sim_load_snapshots` | Per-run load metrics (`active_connections`/`max_connections`/`reserved_headroom`/`avg_query_ms`/`error_rate`, `run_label`, `notes` jsonb) for the load-ramp / tier-scaling proof. Written **only** by the service-role `capture_sim_load_snapshot` RPC (Phase A), sampled **concurrently with the in-flight load wave** (a post-drain snapshot would see only the RPC's own connection). Internal-`SELECT` RLS; read by `/internal/simulation`'s load-curve table (`useSimLoadSnapshots`). |

> **Phase A load/economics RPCs** (migration `20260724170000`, both SECURITY DEFINER · `search_path=public`
> · revoked from public/anon/authenticated · granted `service_role` only): `seed_synthetic_cohort(p_n,
> p_cohort, p_creator_split)` → `{seeded,skipped}` bulk-inserts the **depth pool** (`botseed_<cohort>_<i>`
> — never authenticates; deterministic id via `extensions.uuid_generate_v5` + `on conflict do nothing`;
> relies on the `handle_new_user` trigger to tag `synthetic_users`; role only `content_creator`/`business_client`);
> `capture_sim_load_snapshot(p_run_label, p_error_rate, p_notes)` → one `sim_load_snapshots` row (reads
> `pg_stat_activity` + cross-schema `pg_stat_statements` via `to_regclass`, degrading `avg_query_ms` to NULL
> if absent). The `load` driver reads only session-capable bots (live `bot0##` + active `botla*`), never the
> depth pool. See `docs/wiki/concepts/synthetic-weight-engine.md` (Phase A).

> **Runner-matrix (Slice 1) RPCs** (migrations `20260724181500`/`182000`/`183000`, all SECURITY DEFINER
> · `search_path=public`): `seed_synthetic_content(p_campaigns,p_posts,p_creator_split)` (service_role
> only) — layers public-free **draft** campaigns + DragonShare video posts + `file_uploads` + one
> synthetic org + avatars/geo onto the `botla%`/`botseed_%` load cohort (NEVER the live `bot0##` 25);
> guard-raises if no load-cohort business bot exists. `purge_synthetic_load_cohort()` (service_role only)
> — the **scoped** teardown for the matrix: deletes ONLY `botla%`/`botseed_%` (spares the live 25),
> leaf-deleting the NO-ACTION `push_notifications.actor_id` + crew tables + telemetry before cascading
> the users, then the non-cascading synthetic org; returns a `residual_*` report. `get_sim_load_matrix_summary(p_run_label)`
> — **granted `authenticated`** (revoked anon/public) with an in-body `is_internal_user()` guard (DEFINER
> bypasses the `sim_load_snapshots` RLS), rolls a multi-shard run's per-shard **latest-`captured_at`**
> snapshots into one summed row (Σ concurrency/requests/`media_*`, MAX p95 + DB peaks, latest
> `platform_weight.storage_bytes`) for the `/internal/simulation` "Matrix run (summed)" card. `sim_load_snapshots.notes`
> gains `shard`/`media_requests`/`media_bytes` keys in matrix mode. **Slice 2** (migration `20260725140000`,
> **applied to prod 2026-07-26**, recorded under version `20260726024318`) `create or replace`s this RPC to add an overlap-honest event-sweep
> `honest_peak_concurrency` + `max_concurrent_shards` + `media_errors` + `media_ms_p95_peak` alongside the
> existing naive Σ `offered_concurrency`, so staggered/queued shards can't inflate the reported peak. See
> `docs/wiki/concepts/synthetic-weight-engine.md` (Slice 2).

> **Denormalized `is_synthetic boolean default false`** added (nullable) to 5 rootless/telemetry
> tables — `payment_events`, `analytics_events`, `dragonshare_events`, `pricing_funnel_events`,
> `donny_cost_ledger` — stamped by `BEFORE INSERT` triggers (payment = actor-OR-campaign; dragonshare
> = actor-OR-org-owner; the rest single-party by `user_id`). This is the column a future training
> export keys on. `platform_weight` also gained `users_total_real` + `row_counts_real` (synthetic-
> excluded parallel counts; the physical totals stay synthetic-inclusive by design — real disk/rows
> drive scaling decisions, so `/internal/weight` shows totals with a "real" subcount).
>
> **Functions (SECURITY DEFINER, `search_path=public`):** `is_synthetic(uuid)` /
> `is_synthetic_campaign(uuid)` / `is_synthetic_org(uuid)` (exists-in-registry / campaign-owner /
> org-owner) — **service_role only** (revoked from public/anon/authenticated). `get_simulation_stats()`
> — the ONE surface that intentionally SHOWS synthetic (internal-gated, authenticated+service_role;
> aggregate counts only). `purge_synthetic_data()` — service_role-only leaf-first teardown (deletes
> rootless ledgers before `auth.users`; explicitly deletes the non-cascading synthetic org rows —
> `organizations`/`org_units` have no `auth.users` FK, ownership only via `org_members.role='owner'`;
> **also leaf-deletes the NO-ACTION `push_notifications.actor_id`** the matrix notify-leg creates — Task 3.3).
> `aios_platform_stats`/`aios_revenue_stats`/`aios_cost_stats` + `capture_platform_weight` were
> rewritten to exclude synthetic (actor-OR-parent). The extended `handle_new_user` **preserves** the
> `account_scope='internal'` guard + `ON CONFLICT DO UPDATE` refresh (a corrective migration restored
> these after the initial spine migration reverted them — caught by the Codex second review).

## Social & Outstand Integration

| Table | Purpose |
|-|-|
| `business_outstand_accounts` | Outstand.so account links for businesses |
| `business_contexts` | Business context data for AI matching |
| `creator_automation_preferences` | Creator automation and posting preferences |
| `delegated_posting_permissions` | Permissions for delegated social posting |
| `social_post_log` | Log of social media posts — the enumeration surface `content-performance-capture` measures from. `UNIQUE (outstand_post_id, platform)` + nullable dimension columns (`hashtags`, `caption`, `format`, `scheduled_at`, `published_at`, `creator_id`). **Only rows carrying `verified_at` are measured**, and only server-side code sets it. Has SELECT + INSERT RLS policies and **no UPDATE policy** — so a client upsert must use `ignoreDuplicates` (`ON CONFLICT DO NOTHING`); a `DO UPDATE` branch would need a privilege the client role has never been granted. See [[Social Measurement Spine]]. |
| `outstand_post_ownership` | **Server-established** binding: Outstand post id → the authenticated user who created it. Written ONLY by `outstand-proxy` / `social-proxy` (service role) on a 2xx `POST /posts`, from `ctx.userId` (`auth.getUser()`) and the **provider's own** response id — neither half client-assertable. Read by `outstand-webhook` + `reconcile-social-posts` to decide `social_post_log.user_id`. See the blockquote below. |
| `triple_post_sessions` | Multi-platform posting session tracking |
| `brand_shortlists` | Brand-curated creator shortlists |

> **Server-established post ownership (`outstand_post_ownership`) — 2026-08-06, migration
> `20260806184500`, [[Social Measurement Spine]].** Both `outstand-webhook` and the new
> `reconcile-social-posts` sweep used to decide **who owns a published post** by joining
> `donny_scheduled_posts` on `metadata->>'outstand_post_id'`. **That column is client-writable.**
> Verified on prod, not assumed: `information_schema.column_privileges` shows `authenticated` **and
> `anon`** holding INSERT *and* UPDATE on **every** column of `donny_scheduled_posts` (`metadata`
> included — there is no column-privilege lockdown migration for that table), and `pg_policies` shows
> the INSERT policy as `WITH CHECK (user_id = auth.uid())` with **nothing constraining `metadata`**.
> So any authenticated user could plant a row claiming any post id, have `verified_at` stamped on it,
> and let `content-performance-capture` spend the **org-wide** `OUTSTAND_API_KEY` filing another
> tenant's metrics under their own row — mis-filing the victim's measurement at the same moment.
> Provider ids are 5 characters and low-entropy, so guessing beats knowing.
>
> Columns: `outstand_post_id text PRIMARY KEY` (text, not uuid — real ids are 5-char opaque strings),
> `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `created_at`. Index
> `idx_outstand_post_ownership_user_id` exists only for the reverse direction (forgery investigation),
> not either consumer's hot path.
>
> **Lockdown — `revoke all on public.outstand_post_ownership from public, anon, authenticated` +
> `grant all to service_role`, at TABLE level.** A *column-level* REVOKE is a **documented no-op**
> against Supabase's ambient table-wide GRANT (the same lesson `20260804174854` and `20260805163247`
> record). Nothing in `src/` reads or writes this table, so the client grant set is **empty**, not
> merely reduced. RLS is enabled with a `service_role`-only policy and **deliberately no policy for
> anon/authenticated**, so client statements are denied by grants *and* by RLS-with-no-policy even if
> a future migration re-grants. The migration ends with an `information_schema.role_table_grants`
> verification query — expected result is exactly one row (`service_role`); any `anon`/`authenticated`
> row means the REVOKE did not take. **Verify after applying; never trust "the migration succeeded."**
>
> Consumers are asymmetric by design: `reconcile-social-posts` is **strict** (no binding → counter
> `unbound`, skip — it is new, so this costs nothing), `outstand-webhook` is **permissive** (retains
> the schedule-row match for the legacy population, counted `ownership=legacy_schedule` so that
> population is measurable rather than assumed). A binding that cannot be **read** refuses rather than
> falling back, tolerating only the table-not-yet-existing case — which surfaces as PostgREST
> **`PGRST205`**, *not* SQLSTATE `42P01`, because PostgREST resolves tables from its own schema cache
> and 404s before the query reaches Postgres. Binding/schedule-row disagreement is rejected **per row,
> not per post** (per-post would let a planted row take the victim's real row down with it).
>
> **`donny_scheduled_posts_platform_check` widened** (migration `20260806090000`, applied 2026-08-06):
> adds `'x'` while **keeping** `'twitter'`. The two tables' platform vocabularies were disjoint on
> exactly that value — `business_outstand_accounts` allows `x`, `donny_scheduled_posts` allowed
> `twitter` — and Outstand's own network value is `x`, so `donny_scheduled_posts` was the outlier.
> `twitter` is retained for existing rows (removing a CHECK value is forbidden); `x` is canonical going
> forward.

## Help & Support

| Table | Purpose |
|-|-|
| `help_articles` | Help center articles |
| `help_article_feedback` | User feedback on help articles |

## Views

| View | Purpose |
|-|-|
| `messages_with_profiles` | Messages joined with sender profile data |
| `message_participant_profiles` | Conversation participants with profiles |
| `public_business_profiles` | Public-facing business profile data |
| `public_creator_profiles` | Public-facing creator profile data |
| `public_organizations` | Public-facing organization data |
| `safe_profiles` | Sanitized profile view (no sensitive fields) |
| `public_dragon_tiers` | Public Dragon-tier exposure — `user_id, tier` ONLY (never `balance`), granted to anon; lets the tier badge render on public profiles under the own-row `dragon_point_balances` RLS |
