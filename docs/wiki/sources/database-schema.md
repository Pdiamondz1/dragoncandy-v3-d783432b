---
title: Database Schema
type: source
created: 2026-05-23
updated: 2026-06-01
sources: [docs/DATABASE_SCHEMA.md]
tags: [supabase, database, schema]
---

# Database Schema

Overview of the Supabase Postgres database schema powering DragonCandy.

## Key Claims

- `profiles` is the central user table — always join through here
- Core marketplace flow: campaigns → campaign_applications →
  campaign_collaborations
- Chat system: conversations + conversation_participants + messages
- File uploads are the primary content deliverable mechanism
- 70+ tables organized into: User/Auth, Campaigns, Payments, Messaging,
  Files, Reviews, Donny AI, DragonShare, Organizations
- RLS (Row Level Security) assumed on all tables
- `donny_knowledge` table exists for Donny AI's knowledge base (RAG)
- Payment ledger architecture: payment_events + stripe_webhook_events +
  rush_surcharge_log
- Social integration tables: business_outstand_accounts, social_post_log,
  triple_post_sessions, delegated_posting_permissions

## Data Points

- Key views: messages_with_profiles, public_business_profiles,
  public_creator_profiles, safe_profiles
- Donny AI tables: donny_actions, donny_conversations, donny_messages,
  donny_knowledge, donny_nudges, donny_tool_executions, donny_cost_ledger,
  donny_usage, donny_scheduled_posts
- DragonShare tables: dragonshare_boosts, dragonshare_engagement,
  dragonshare_posts, dragonshare_payouts, dragonshare_events
- May 2026 column additions: push_notifications (type/category/action_url/
  actor metadata), notification_preferences (preferences_matrix JSONB),
  campaigns (posting_preferences, posting_schedule_status,
  escrow_checkout_session_id), business_profiles (cgc_posting_preferences)

## See Also

- [[Supabase]]
- [[Campaign Lifecycle]]
- [[Donny AI]]
- [[DragonShare]]
- [[Notification System]]
- [[Donny AI Cost Architecture]]
- [[Content Delivery State Machine]]
