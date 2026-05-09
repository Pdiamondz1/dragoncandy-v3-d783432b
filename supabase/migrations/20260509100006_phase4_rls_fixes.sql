-- 20260509100006_phase4_rls_fixes.sql
-- Patch 3 issues from Phase 4 code review:
--   1. Missing INSERT policy on campaign_social_hooks
--   2. Missing INSERT policy on triple_post_sessions
--   3. Missing CHECK constraints on rush_surcharge_log billing columns

-- 1. campaign_social_hooks: allow authenticated users to insert their own hooks
CREATE POLICY "Users can insert own hooks"
  ON campaign_social_hooks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 2. triple_post_sessions: allow participants to create sessions
CREATE POLICY "Participants can insert sessions"
  ON triple_post_sessions FOR INSERT
  WITH CHECK (
    auth.uid() = restaurant_id OR
    auth.uid() = creator_id OR
    auth.uid() = brand_id
  );

-- 3. rush_surcharge_log: enforce positive values on billing ledger columns
ALTER TABLE rush_surcharge_log ADD CONSTRAINT chk_platform_count CHECK (platform_count > 0);
ALTER TABLE rush_surcharge_log ADD CONSTRAINT chk_surcharge_cents CHECK (surcharge_cents > 0);
