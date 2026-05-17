# Transactional Data Reset — Design Spec

**Date:** 2026-05-17
**Author:** Dame + Claude
**Status:** Ready

## Context

DragonCandy is pre-revenue with ~30 organic users and no paying customers. Before production launch, all transactional data (campaigns, messaging, Donny AI chat history, analytics, reviews, promotions, file uploads, payments) needs to be wiped so existing accounts start fresh. User identity data — profiles, locations, social integrations, Stripe accounts, and preferences — must be preserved. Stale balance fields on preserved tables are reset to zero.

## Approach

A single Supabase SQL migration using `TRUNCATE ... CASCADE`. Postgres handles FK ordering automatically in one atomic transaction. Storage buckets for campaign/messaging files are emptied; profile-related buckets are untouched. Run during a maintenance window to avoid Realtime subscription errors.

## Tables to Clear

### Campaign Domain
| Table | Cascade Clears |
|-------|----------------|
| `campaigns` | `campaign_applications`, `campaign_collaborations`, `campaign_deliverables`, `campaign_invitations`, `campaign_matches`, `campaign_media`, `campaign_social_hooks`, `campaign_sponsorships`, `donny_campaign_previews`, `application_counter_offers`, `triple_post_sessions`, `rush_surcharge_log`, `social_post_log`, `delegated_posting_permissions`, `campaign_skips`, `content_disputes`, `donny_events` (via campaign_id FK), `payment_events` (via campaign_id FK) |
| `campaign_templates` | (standalone) |
| `campaign_brief_generations` | (standalone) |
| `promotions` | `promotion_submissions`, `discount_codes` |

### DragonShare Domain
| Table | Cascade Clears |
|-------|----------------|
| `dragonshare_posts` | `dragonshare_boosts`, `dragonshare_engagement`, `dragonshare_events` |
| `dragonshare_payouts` | (standalone, FK to dragonshare_boosts — truncate after posts) |

### Messaging Domain
| Table | Cascade Clears |
|-------|----------------|
| `conversations` | `conversation_participants`, `messages`, `message_reactions` |

### Donny AI Domain
| Table | Cascade Clears |
|-------|----------------|
| `donny_conversations` | `donny_messages`, `donny_actions`, `donny_tool_executions` |
| `donny_nudges` | (standalone) |
| `donny_help_logs` | (standalone) |
| `donny_events` | (standalone — also cascaded via campaigns, but explicit for safety) |
| `donny_cost_ledger` | (standalone) |
| `donny_usage` | (standalone — resets user AI budgets for fresh launch) |
| `donny_scheduled_posts` | (standalone) |

### Files Domain
| Table | Cascade Clears |
|-------|----------------|
| `file_uploads` | `file_versions`, `file_permissions`, `file_comments`, `file_tag_assignments` |

### Reviews Domain
| Table | Cascade Clears |
|-------|----------------|
| `project_reviews` | `review_responses` |

### Payments Domain
| Table | Notes |
|-------|-------|
| `payment_events` | Payment ledger (also cascaded via campaigns, explicit for safety) |
| `promotion_redemptions` | Discount redemption events (no cascade path — must be explicit) |

### Analytics & Tracking
| Table | Notes |
|-------|-------|
| `analytics_events` | App telemetry |
| `beta_feedback` | Beta user feedback |
| `profile_views` | Profile visit tracking |
| `pricing_funnel_events` | Sales funnel analytics |
| `help_article_feedback` | User feedback on help articles |

### Notifications & Presence
| Table | Notes |
|-------|-------|
| `push_notifications` | Sent notification records |
| `user_presence` | Online/offline session state (recreated on login) |

### Other Transactional
| Table | Notes |
|-------|-------|
| `brand_shortlists` | Brand-saved creator lists |
| `business_contexts` | Cached extracted business data |
| `stripe_webhook_events` | Stripe event log |
| `toast_sync_events` | Toast API interaction ledger |
| `llm_hourly_usage` | LLM rate-limiting counters |
| `account_deletion_requests` | Deletion workflow state |

## Preserved Table Field Resets

These fields on preserved tables reference cleared transactional data and must be zeroed out:

| Table | Field | Reset To |
|-------|-------|----------|
| `org_units` | `pending_balance` | `0` |
| `business_profiles` | `pending_balance` | `0` |
| `creator_profiles` | `pending_balance` | `0` |
| `profiles` | `first_run_missions` | `'{}'::jsonb` (reset onboarding for fresh start) |

## Storage Buckets to Empty

| Bucket | Action |
|--------|--------|
| `campaign-assets` | Delete all objects |
| `campaign-deliverables` | Delete all objects |
| `campaign-previews` | Delete all objects (SVG preview images from Donny) |
| `project-deliverables` | Delete all objects |
| `message-attachments` | Delete all objects |
| `promotion-videos` | Delete all objects (promotion submission videos) |

All buckets are preserved (not dropped). The `DELETE FROM storage.objects` statement is a no-op for buckets with no objects.

## Tables to Preserve (No Changes)

### User Identity
- `profiles` — core user table (field reset: `first_run_missions`)
- `creator_profiles` — creator extended data (field reset: `pending_balance`)
- `business_profiles` — business extended data (field reset: `pending_balance`)

### Organizations
- `organizations`
- `org_units` — includes Stripe Connect account IDs (field reset: `pending_balance`)
- `org_members` — organization membership roles

### Social Integrations
- `business_outstand_accounts` — Outstand social platform connections
- `toast_connections` — Toast POS OAuth credentials

### User Preferences & Settings
- `notification_preferences` — per-user notification settings
- `creator_automation_preferences` — AI agent settings
- `feature_flags` — feature toggles
- `onboarding_steps` — onboarding flow definitions
- `user_onboarding_progress` — per-user onboarding completion

### Auth & Tokens
- `email_verification_tokens`

### Donny Infrastructure
- `donny_knowledge` — vector knowledge base (help docs, FAQs)
- `donny_oauth_clients` — OAuth client registrations
- `donny_oauth_codes` — OAuth authorization codes
- `donny_oauth_tokens` — OAuth access tokens

### Reference Content
- `help_articles` — help center content (seeded reference data)
- `file_tags` — tag definitions (not assignments)

### Storage Buckets Preserved
- `profile-assets`
- `profile-media`

## Migration SQL Structure

```sql
BEGIN;

-- 1. Campaign domain
TRUNCATE TABLE campaigns CASCADE;
TRUNCATE TABLE campaign_templates CASCADE;
TRUNCATE TABLE campaign_brief_generations CASCADE;
TRUNCATE TABLE promotions CASCADE;

-- 2. DragonShare domain
TRUNCATE TABLE dragonshare_posts CASCADE;
TRUNCATE TABLE dragonshare_payouts CASCADE;

-- 3. Messaging domain
TRUNCATE TABLE conversations CASCADE;

-- 4. Donny AI domain
TRUNCATE TABLE donny_conversations CASCADE;
TRUNCATE TABLE donny_nudges;
TRUNCATE TABLE donny_help_logs;
TRUNCATE TABLE donny_events;
TRUNCATE TABLE donny_cost_ledger;
TRUNCATE TABLE donny_usage;
TRUNCATE TABLE donny_scheduled_posts;

-- 5. Files domain
TRUNCATE TABLE file_uploads CASCADE;

-- 6. Reviews domain
TRUNCATE TABLE project_reviews CASCADE;

-- 7. Payments domain
TRUNCATE TABLE payment_events;
TRUNCATE TABLE promotion_redemptions;

-- 8. Analytics & tracking
TRUNCATE TABLE analytics_events;
TRUNCATE TABLE beta_feedback;
TRUNCATE TABLE profile_views;
TRUNCATE TABLE pricing_funnel_events;
TRUNCATE TABLE help_article_feedback;

-- 9. Notifications & presence
TRUNCATE TABLE push_notifications;
TRUNCATE TABLE user_presence;

-- 10. Other transactional
TRUNCATE TABLE brand_shortlists;
TRUNCATE TABLE business_contexts;
TRUNCATE TABLE stripe_webhook_events;
TRUNCATE TABLE toast_sync_events;
TRUNCATE TABLE llm_hourly_usage;
TRUNCATE TABLE account_deletion_requests;

-- 11. Reset stale balance fields on preserved tables
UPDATE org_units SET pending_balance = 0 WHERE pending_balance IS DISTINCT FROM 0;
UPDATE business_profiles SET pending_balance = 0 WHERE pending_balance IS DISTINCT FROM 0;
UPDATE creator_profiles SET pending_balance = 0 WHERE pending_balance IS DISTINCT FROM 0;
UPDATE profiles SET first_run_missions = '{}'::jsonb WHERE first_run_missions IS DISTINCT FROM '{}'::jsonb;

-- 12. Empty storage buckets (delete objects, keep buckets)
DELETE FROM storage.objects WHERE bucket_id IN (
  'campaign-assets',
  'campaign-deliverables',
  'campaign-previews',
  'project-deliverables',
  'message-attachments',
  'promotion-videos'
);

COMMIT;
```

## Verification

After running the migration:

1. **Confirm cleared tables are empty**: `SELECT count(*) FROM <table>` for each cleared table (all should return 0)
2. **Confirm preserved tables have data**: `SELECT count(*) FROM profiles` (should equal ~30)
3. **Confirm balance resets**: `SELECT count(*) FROM org_units WHERE pending_balance != 0` (should return 0)
4. **Confirm storage buckets are empty**: `SELECT count(*) FROM storage.objects WHERE bucket_id IN ('campaign-assets', 'campaign-deliverables', 'campaign-previews', 'project-deliverables', 'message-attachments', 'promotion-videos')` (should return 0)
5. **Confirm profile storage intact**: `SELECT count(*) FROM storage.objects WHERE bucket_id IN ('profile-assets', 'profile-media')` (should be > 0 if users have avatars)
6. **Confirm views return empty**: `SELECT count(*) FROM messages_with_profiles` (should return 0)
7. **Test app functionality**: Log in as a user, verify profile/settings/social integrations are intact, verify empty campaign/messaging states render correctly without errors

## Risks

- **No rollback without backup**: TRUNCATE is not reversible. Take a database backup before running.
- **Realtime subscriptions**: Active Realtime subscriptions to `messages` or `user_presence` channels could error during TRUNCATE. Run during a maintenance window.
- **Storage deletion**: `DELETE FROM storage.objects` removes files permanently from Supabase storage.
- **Stripe test-mode orphans**: After clearing `payment_events` and `dragonshare_payouts`, Stripe test-mode records will have no local counterpart. Acceptable for a pre-revenue reset.
- **Views return empty**: Views like `messages_with_profiles`, `toast_menu_performance`, `toast_traffic_patterns`, `toast_redemption_history` will return empty results until new data is created. This is expected behavior.
- **Table existence**: Some tables may not yet exist in the database if their migration hasn't run. Postgres TRUNCATE does not support `IF EXISTS`, so verify all tables exist before running (covered in pre-migration checklist).

## Pre-Migration Checklist

- [ ] Take full database backup via Supabase dashboard
- [ ] Verify all tables in the migration exist in the current schema
- [ ] Run migration during low-traffic window
- [ ] Notify any active users about the data reset
