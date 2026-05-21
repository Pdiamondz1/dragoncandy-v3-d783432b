# Audit Part C -- Supabase Dashboard Checks

Generated: 2026-04-10  
Method: Supabase MCP (direct SQL + Logs API)  
Project: `zocahiffooqdybdhguqv` (DragonCandy_v3, us-east-2, ACTIVE_HEALTHY)  
Status: **Raw findings only -- no triage, no fixes proposed**

---

## 1. Storage Buckets

### Bucket Inventory

| Bucket | Public | File Size Limit | Allowed MIME Types | Files | Images | Videos | Total Size |
|--------|--------|----------------|--------------------|-------|--------|--------|------------|
| `avatars` | **Public** | none | none | 0 | 0 | 0 | 0 |
| `campaign-assets` | **Public** | 50 MB | image/*, video/*, application/pdf | 0 | 0 | 0 | 0 |
| `campaign-deliverables` | **Public** | 100 MB | image/*, video/*, application/pdf | 21 | 21 | 0 | 46 MB |
| `campaign-files` | **Public** | none | none | 2 | 2 | 0 | 71 kB |
| `campaign-media` | **Public** | none | none | 0 | 0 | 0 | 0 |
| `campaign-previews` | **Public** | none | none | 2 | 0 | 0 | 5 kB |
| `creator-portfolios` | **Public** | none | none | 0 | 0 | 0 | 0 |
| `file-uploads` | **Public** | none | none | 0 | 0 | 0 | 0 |
| `message-attachments` | **Private** | none | none | 7 | 5 | 0 | 5 MB |
| `profile-assets` | **Public** | none | none | **91** | **70** | **21** | **416 MB** |
| `profile-media` | **Private** | none | none | 22 | 22 | 0 | 10 MB |
| `project-deliverables` | **Private** | none | none | 0 | 0 | 0 | 0 |
| `promotion-videos` | **Public** | 50 MB | none | 3 | 0 | 2 | 32 MB |

### Storage Observations

1. **`profile-assets` is the dominant bucket**: 91 files, 416 MB total. Contains avatars, logos, portfolio images (DSLR JPGs up to 6192x4128), portfolio videos (.mov, .mp4). All served publicly with no size limit and no MIME type restriction.
2. **`avatars` bucket exists but is empty** -- avatars are stored in `profile-assets` instead.
3. **`creator-portfolios` bucket exists but is empty** -- portfolios are stored in `profile-assets` instead.
4. **`campaign-assets` and `campaign-media` exist but are empty** -- deliverables go to `campaign-deliverables`.
5. **`file-uploads` bucket is empty** -- unused.
6. **10 of 13 buckets are Public** -- only `message-attachments`, `profile-media`, and `project-deliverables` are private.
7. **`profile-assets` has no file size limit** -- creators can upload arbitrarily large files (the 6192x4128 DSLR JPGs are likely 5-15 MB each, .mov files are likely 20-50 MB each).
8. **21 video files in `profile-assets`** total 416 MB -- these are the files being eagerly loaded as portfolio thumbnails.

---

## 2. Database Indexes

### Existing Indexes (key tables)

#### `profiles`
| Index | Columns | Type |
|-------|---------|------|
| `profiles_pkey` | `id` | UNIQUE btree |
| `unique_profile_email` | `email` | UNIQUE btree |

#### `creator_profiles`
| Index | Columns | Type |
|-------|---------|------|
| `creator_profiles_pkey` | `id` | UNIQUE btree |
| `creator_profiles_profile_slug_key` | `profile_slug` | UNIQUE btree |
| `creator_profiles_user_id_key` | `user_id` | UNIQUE btree |
| `idx_creator_profiles_city` | `city` | btree |
| `idx_creator_profiles_country` | `country` | btree |
| `idx_creator_profiles_postal_code` | `postal_code` | btree |
| `idx_creator_profiles_stripe_account` | `stripe_account_id` | partial (WHERE NOT NULL) |

#### `business_profiles`
| Index | Columns | Type |
|-------|---------|------|
| `business_profiles_pkey` | `id` | UNIQUE btree |
| `business_profiles_profile_slug_key` | `profile_slug` | UNIQUE btree |
| `business_profiles_user_id_key` | `user_id` | UNIQUE btree |

#### `campaigns`
| Index | Columns | Type |
|-------|---------|------|
| `campaigns_pkey` | `id` | UNIQUE btree |
| `idx_campaigns_created_at` | `created_at DESC` | btree |
| `idx_campaigns_delivery_type` | `delivery_type` | btree |
| `idx_campaigns_escrow_status` | `escrow_status` | btree |
| `idx_campaigns_open_for_sponsorship` | `open_for_sponsorship` | partial (WHERE true) |
| `idx_campaigns_pricing_type` | `pricing_type` | btree |
| `idx_campaigns_status` | `status` | btree |
| `idx_campaigns_user_id` | `user_id` | btree |

#### `campaign_applications`
| Index | Columns | Type |
|-------|---------|------|
| `campaign_applications_pkey` | `id` | UNIQUE btree |
| `campaign_applications_campaign_id_creator_id_key` | `(campaign_id, creator_id)` | UNIQUE btree |
| `idx_campaign_applications_campaign_id` | `campaign_id` | btree |
| `idx_campaign_applications_creator_id` | `creator_id` | btree |

#### `campaign_collaborations`
| Index | Columns | Type |
|-------|---------|------|
| `campaign_collaborations_pkey` | `id` | UNIQUE btree |
| `campaign_collaborations_campaign_id_creator_id_key` | `(campaign_id, creator_id)` | UNIQUE btree |
| `idx_campaign_collaborations_campaign_id` | `campaign_id` | btree |
| `idx_campaign_collaborations_creator_id` | `creator_id` | btree |
| `idx_campaign_collaborations_completion` | `(business_completion_status, creator_completion_status)` | partial (WHERE status='active') |
| `idx_collaborations_content_status` | `content_status` | btree |

#### `messages`
| Index | Columns | Type |
|-------|---------|------|
| `messages_pkey` | `id` | UNIQUE btree |
| `idx_messages_campaign_id` | `campaign_id` | btree |
| `idx_messages_campaign_unread` | `(campaign_id, recipient_id)` | partial (WHERE read_at IS NULL) |
| `idx_messages_category` | `category` | btree |
| `idx_messages_conversation_id` | `conversation_id` | btree |
| `idx_messages_is_starred` | `is_starred` | btree |
| `idx_messages_parent_id` | `parent_message_id` | btree |
| `idx_messages_sender_recipient` | `(sender_id, recipient_id)` | btree |
| `idx_messages_thread_id` | `thread_id` | btree |

#### `conversations`
| Index | Columns | Type |
|-------|---------|------|
| `conversations_pkey` | `id` | UNIQUE btree |
| `idx_conversations_campaign_id` | `campaign_id` | btree |
| `idx_conversations_updated_at` | `updated_at DESC` | btree |

#### `conversation_participants`
| Index | Columns | Type |
|-------|---------|------|
| `conversation_participants_pkey` | `id` | UNIQUE btree |
| `conversation_participants_conversation_id_user_id_key` | `(conversation_id, user_id)` | UNIQUE btree |
| `idx_conversation_participants_conversation_id` | `conversation_id` | btree |
| `idx_conversation_participants_user_id` | `user_id` | btree |

#### `file_uploads`
| Index | Columns | Type |
|-------|---------|------|
| `file_uploads_pkey` | `id` | UNIQUE btree |
| `idx_file_uploads_campaign_id` | `campaign_id` | btree |
| `idx_file_uploads_category` | `file_category` | btree |
| `idx_file_uploads_status` | `upload_status` | btree |
| `idx_file_uploads_uploaded_by` | `uploaded_by` | btree |

#### `promotions`
| Index | Columns | Type |
|-------|---------|------|
| `promotions_pkey` | `id` | UNIQUE btree |
| `idx_promotions_business_id` | `business_id` | btree |
| `idx_promotions_dates` | `(start_date, end_date)` | btree |
| `idx_promotions_status` | `status` | btree |
| `idx_promotions_user_id` | `user_id` | btree |

#### `analytics_events`
| Index | Columns | Type |
|-------|---------|------|
| `analytics_events_pkey` | `id` | UNIQUE btree |
| `idx_analytics_events_created_at` | `created_at` | btree |
| `idx_analytics_events_event_type` | `event_type` | btree |
| `idx_analytics_events_page_url` | `page_url` | btree |
| `idx_analytics_events_user_id` | `user_id` | btree |

### Foreign Keys Missing Indexes

The following FK columns have **no index**, which means JOINs and cascading deletes on these columns will require sequential scans:

| Table | Column | Constraint |
|-------|--------|------------|
| `application_counter_offers` | `application_id` | `application_counter_offers_application_id_fkey` |
| `campaign_collaborations` | `application_id` | `campaign_collaborations_application_id_fkey` |
| `campaign_invitations` | `invited_by` | `campaign_invitations_invited_by_fkey` |
| `campaign_media` | `uploaded_by` | `campaign_media_uploaded_by_fkey` |
| `campaign_sponsorships` | `restaurant_id` | `campaign_sponsorships_restaurant_id_fkey` |
| `discount_codes` | `submission_id` | `discount_codes_submission_id_fkey` |
| `donny_actions` | `conversation_id` | `donny_actions_conversation_id_fkey` |
| `donny_oauth_codes` | `client_id` | `donny_oauth_codes_client_id_fkey` |
| `donny_oauth_codes` | `user_id` | `donny_oauth_codes_user_id_fkey` |
| `donny_oauth_tokens` | `client_id` | `donny_oauth_tokens_client_id_fkey` |
| `donny_oauth_tokens` | `user_id` | `donny_oauth_tokens_user_id_fkey` |
| `file_comments` | `parent_comment_id` | `file_comments_parent_comment_id_fkey` |
| `file_comments` | `user_id` | `file_comments_user_id_fkey` |
| `file_permissions` | `granted_by` | `file_permissions_granted_by_fkey` |
| `file_tag_assignments` | `assigned_by` | `file_tag_assignments_assigned_by_fkey` |
| `file_tags` | `created_by` | `file_tags_created_by_fkey` |
| `file_versions` | `created_by` | `file_versions_created_by_fkey` |
| `messages` | `forwarded_from_message_id` | `messages_forwarded_from_message_id_fkey` |
| `payment_events` | `actor_id` | `payment_events_actor_id_fkey` |
| `profile_views` | `viewer_id` | `profile_views_viewer_id_fkey` |
| `project_reviews` | `sponsorship_id` | `project_reviews_sponsorship_id_fkey` |
| `push_notifications` | `user_id` | `push_notifications_user_id_fkey` |
| `review_responses` | `responder_id` | `review_responses_responder_id_fkey` |

**Total: 23 foreign keys without indexes.**

---

## 3. Logs — Postgres (last 24h)

- **Error-level entries: 1** -- `"function sum(text) does not exist"` (caused by our audit query, not application code)
- **Application errors: 0**
- No entries mentioning `profile-assets`, `storage`, `RLS`, `policy`, `permission denied`, `timeout`, or `statement canceled`
- Log is dominated by routine connection events (postgrest pool cycling, postgres_exporter metrics, checkpoint activity)

---

## 4. Logs — Edge Functions (last 24h)

### Functions Invoked
| Function | Invocations | Status Codes |
|----------|------------|--------------|
| `verify-recaptcha` | 8 (4 OPTIONS + 4 POST) | All **200** |
| `check-restaurant-payout-status` | 14 (5 OPTIONS + 9 POST) | All **200** |

- **Zero errors (no 4xx or 5xx)** across all Edge Function invocations
- No error messages mentioning `stripe`, `payment`, `storage`, or `signed`
- `verify-recaptcha` execution time: 115-197 ms
- `check-restaurant-payout-status` execution time: 150-534 ms

---

## 5. Logs — API / PostgREST (last 24h)

| Status Code | Count |
|------------|-------|
| 200 | 33 |
| 201 | 37 |
| 206 | 17 |
| 304 | 13 |

- **Total 4xx responses: 0**
- **Total 5xx responses: 0**
- All API requests returned success status codes
- 201s are analytics_events inserts (POST /rest/v1/analytics_events)
- 206s are partial content responses (range requests, likely for video streaming)

---

## 6. Logs — Storage (last 24h)

### Storage Request Patterns

All storage requests returned **200**. No 4xx or 5xx errors.

#### Signed URL Generation (POST /object/sign/...)
- Bulk signed URL generation visible in bursts -- **30+ POST requests within the same second** from a single page load
- User agents observed: Chrome desktop (Windows), HeadlessChrome (our audit), Mobile Safari (iPhone)
- Every creator's entire portfolio is signed on each Browse Creators page load:
  - `478c1421...` (JGR Media): 4 portfolio files signed per page load
  - `8e2f6554...` (Charlie Smith): 12 portfolio files signed per page load (10 JPG + 1 MOV + 1 MOV)
  - `3cf4cd98...` (Dominick Commesso): 13 portfolio files signed per page load (all .mp4)

#### Signed URL Retrieval (GET /object/sign/...?token=)
- Matching GET requests for each signed URL -- confirming the browser then downloads each file at full resolution
- `.mov` and `.mp4` files are being served via signed URLs and fully downloaded

#### Mobile Safari Requests Observed
- iPhone (iOS 18.7, Safari 604.1) making the same signed URL requests
- `portfolio-1775664638986.mov` served to mobile Safari -- full .mov file to a phone
- `portfolio-1775664989397.JPG` (6192x4128 DSLR) served to mobile Safari at full resolution

---

## 7. RLS Sanity Check

### Tables with RLS Enabled but Zero Policies

| Table |
|-------|
| `donny_oauth_clients` |
| `donny_oauth_codes` |
| `stripe_webhook_events` |

These 3 tables have Row Level Security enabled but **no policies defined**, meaning all SELECT/INSERT/UPDATE/DELETE via the API client will return empty results or be blocked silently.

---

*End of Supabase dashboard checks. Awaiting acknowledgment before proceeding to triage or fixes.*
