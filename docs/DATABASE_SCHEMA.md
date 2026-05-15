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
