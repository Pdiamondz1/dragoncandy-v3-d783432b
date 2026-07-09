# Supabase Database Schema

## Key Relationships

* `profiles` is the central user table — always join through here for user info
* `campaigns` → `campaign_applications` → `campaign_collaborations` is the core marketplace flow
* `conversations` + `conversation_participants` + `messages` power the chat system
* `file_uploads` are the primary content deliverable mechanism between creators and brands

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
| `campaign_invitations` | Direct invites from brands to creators |
| `campaign_matches` | Matched brand/creator pairings |
| `campaign_sponsorships` | Sponsorship arrangements within campaigns |
| `application_counter_offers` | Negotiation counter-offers on applications |

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
| `donny_messages` | Individual messages in Donny conversations |
| `donny_help_logs` | Help requests and resolutions via Donny |
| `donny_knowledge` | Donny's knowledge base entries (RAG) |
| `donny_nudges` | Proactive nudge definitions and delivery tracking |
| `donny_tool_executions` | Tool call logs from Donny orchestrator |
| `donny_oauth_clients` | OAuth client registrations for Donny API |
| `donny_oauth_codes` | OAuth authorization codes |
| `donny_oauth_tokens` | OAuth access/refresh tokens |
| `donny_scheduled_posts` | Cross-platform posting schedule (auto cross-scheduling). Per-platform caption/media/hashtags, `scheduled_at`, status lifecycle, and `ai_suggested_time`/`ai_reasoning` for Donny-proposed slots. |
| `donny_cost_ledger` | Per-call **runtime** AI-spend ledger (Donny/Dezzy generation + RAG embeddings) — the source of truth for the ≤15%-of-revenue AI kill-switch (NOT the total Anthropic/OpenAI invoice, which is mostly founder dev spend/opex). Written only by `_shared/cost-ledger.ts`. `user_id` is **nullable** (system/anonymous calls log `NULL`; the FK to `auth.users` is kept); `tier` ∈ `T0`–`T3` or `'embedding'`. Summed MTD by the `aios_cost_stats()` RPC (see `docs/wiki/concepts/aios-runtime-spend-source-of-truth.md`). |

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

## Social & Outstand Integration

| Table | Purpose |
|-|-|
| `business_outstand_accounts` | Outstand.so account links for businesses |
| `business_contexts` | Business context data for AI matching |
| `creator_automation_preferences` | Creator automation and posting preferences |
| `delegated_posting_permissions` | Permissions for delegated social posting |
| `social_post_log` | Log of social media posts |
| `triple_post_sessions` | Multi-platform posting session tracking |
| `brand_shortlists` | Brand-curated creator shortlists |

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
