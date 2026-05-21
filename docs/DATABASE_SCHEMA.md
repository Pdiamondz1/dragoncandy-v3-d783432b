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

## DragonShare

| Table | Purpose |
|-|-|
| `dragonshare_boosts` | Content boost campaigns |
| `dragonshare_engagement` | Engagement tracking on shared content |
| `dragonshare_events` | DragonShare lifecycle events |
| `dragonshare_payouts` | Creator payouts from DragonShare |
| `dragonshare_posts` | Shared content posts |

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
