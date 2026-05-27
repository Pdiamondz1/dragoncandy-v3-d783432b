-- Migration: Partial index for promotion-sourced scheduled posts
-- Spec ref: Section 3.4 (Posted to Social stat card), Section 4.3 Migration 3

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_donny_scheduled_posts_promotion
ON donny_scheduled_posts (user_id, status)
WHERE metadata->>'source' = 'promotion';
