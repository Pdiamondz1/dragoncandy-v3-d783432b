---
title: File Management
type: entity
created: 2026-06-10
updated: 2026-06-10
sources: [supabase/migrations/20250617123640_3a76508a-1d8c-4b4a-aea2-e11076858503.sql, src/hooks/useFileQuery.ts, src/hooks/useSignedUrl.ts]
tags: [files, deliverables, storage, rls, content-delivery, schema]
---

# File Management

The system that moves content between creators and brands — `file_uploads` is the **primary content
deliverable mechanism** (per `docs/DATABASE_SCHEMA.md`), so this entity sits at the center of the
[[Content Delivery State Machine]] and [[Campaign Lifecycle]]. Surfaced as a wiki gap by the first
autoresearch `loop` run.

## Schema

Six tables, all RLS-enabled, defined in
`supabase/migrations/20250617123640_3a76508a-1d8c-4b4a-aea2-e11076858503.sql`:

- **`file_uploads`** — the record: `file_path`, `bucket_name`, `mime_type`, `file_hash`,
  `upload_status`, `file_category`, `is_public`, `metadata`, plus `campaign_id` FK (CASCADE) and
  `org_unit_id` FK (SET NULL; auto-populated by `20260514000004_file_uploads_org_unit.sql`). The
  `campaign_id` link is what makes it the deliverable mechanism — queried as
  `useFileUploads(campaignId, 'deliverable')`.
- **`file_versions`** — version history (`version_number`, `changes_description`).
- **`file_permissions`** — fine-grained access (`permission_type`: view/download/edit/delete/share,
  optional `expires_at`), decoupled from campaign roles.
- **`file_comments`** — threaded (`parent_comment_id`) with `annotation_data` JSONB for future markup.
- **`file_tags`** + **`file_tag_assignments`** — tagging (junction unique on file+tag).

## Storage & URLs

Four **private** buckets created in the same migration: `profile-media`, `campaign-assets`,
**`project-deliverables`** (creator submissions / final deliverables), and `message-attachments`.
Path convention is `{campaign_id}/*` or `{user_id}/*`, enforced by storage RLS.

URLs are **time-limited signed URLs** via `src/hooks/useSignedUrl.ts` (~3500s TTL, cached) — **not**
public URLs. This is the opposite security model from [[DragonShare]], whose `content_file_path` is a
public URL used directly as an `<img>` src. Don't confuse the two: file-management deliverables are
private/signed; DragonShare content is public.

## Maturity by sub-feature

| Sub-feature | Status | Evidence |
|-------------|--------|----------|
| **Uploads** | ✅ Shipped | `useCreateFileUpload`/`useDeleteFileUpload` (`useFileUploadMutations.ts`), `EnhancedFileUpload.tsx`, wired into `ActivePhaseView.tsx` |
| **Permissions** | ✅ Shipped | `useFilePermissions.ts` (`grantPermission`/`revokePermission`) |
| **Comments** | ✅ Shipped | `useCreateFileComment` + threaded `FileCommentsPanel.tsx` |
| **Versions** | ⚠️ Schema-only | queried + shown read-only in `FileDetailsPanel`, but **no create/update mutation hooks** |
| **Tags** | ⚠️ Schema-only | queried in `useFileQuery.ts`, but **no write hooks and no UI** |

Edge functions touching files: `bulk-download-campaign-content` (zips a campaign's uploads),
`release-creator-payout` (verifies deliverables before payout), plus `donny-chat` and
`fire-campaign-social-hook` reads. No edge functions for versions/permissions/tags — those are
client-side + RLS.

## Deliverable flow

Creator uploads via `EnhancedFileUpload` → stored in private `project-deliverables` →
`file_uploads` row with `campaign_id` (+ inherited `org_unit_id`) → brand reviews in
`ContentReviewSection` / `DeliverablesArchive` → comment/approve → `release-creator-payout` checks the
deliverable exists before releasing funds. This is the file-level spine of the
[[Content Delivery State Machine]].

## Known Issues

- **Versions and Tags are schema-only** — tables, indexes, RLS, and read queries exist, but there are
  no write paths or (for tags) UI. Either build them or treat as deferred; flagged so the gap isn't
  mistaken for a shipped feature.

## See Also

- [[Content Delivery State Machine]]
- [[Campaign Lifecycle]]
- [[Organizations]]
- [[Supabase]]
- [[DragonShare]]
- [[Donny AI]]
