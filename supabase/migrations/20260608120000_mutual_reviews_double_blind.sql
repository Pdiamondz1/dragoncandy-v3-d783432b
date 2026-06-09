-- Mutual Reviews: double-blind reveal, read-time enforced. Additive + corrective.
-- See docs/superpowers/specs/2026-06-08-mutual-reviews-visibility-design.md

-- 1. reveal_at column (the 14-day timeout half of the double-blind)
ALTER TABLE public.project_reviews
  ADD COLUMN IF NOT EXISTS reveal_at timestamptz;

-- Backfill existing rows as already-revealed (they predate double-blind and were public).
-- created_at is in the past, so `now() >= reveal_at` is immediately true.
UPDATE public.project_reviews
  SET reveal_at = created_at
  WHERE reveal_at IS NULL;

-- New rows get reveal_at = now() + 14 days unless explicitly supplied.
CREATE OR REPLACE FUNCTION public.set_review_reveal_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reveal_at IS NULL THEN
    NEW.reveal_at := now() + interval '14 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_review_reveal_at_trigger ON public.project_reviews;
CREATE TRIGGER set_review_reveal_at_trigger
  BEFORE INSERT ON public.project_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_review_reveal_at();

-- 2. Counterpart check, RLS-safe (SECURITY DEFINER avoids recursive RLS on the
--    same table — mirrors the has_role() pattern). Returns only a boolean.
CREATE OR REPLACE FUNCTION public.has_counterpart_review(
  p_reviewer uuid,
  p_reviewee uuid,
  p_collaboration uuid,
  p_sponsorship uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_reviews cp
    WHERE cp.reviewer_id = p_reviewee          -- the other party
      AND cp.reviewee_id = p_reviewer          -- reviewing me back
      AND cp.collaboration_id IS NOT DISTINCT FROM p_collaboration
      AND cp.sponsorship_id   IS NOT DISTINCT FROM p_sponsorship
  );
$$;

-- Helps the counterpart lookup.
CREATE INDEX IF NOT EXISTS idx_project_reviews_reviewer_reviewee
  ON public.project_reviews(reviewer_id, reviewee_id);

-- 3. Replace the two SELECT policies that defeat double-blind with one
--    reveal-aware policy. (INSERT/UPDATE policies are left untouched.)
DROP POLICY IF EXISTS "Users can view public reviews" ON public.project_reviews;
DROP POLICY IF EXISTS "Users can view their own reviews" ON public.project_reviews;

CREATE POLICY "Reviews visible when revealed or own"
  ON public.project_reviews
  FOR SELECT
  USING (
    auth.uid() = reviewer_id
    OR (
      is_public
      AND (
        public.has_counterpart_review(reviewer_id, reviewee_id, collaboration_id, sponsorship_id)
        OR now() >= reveal_at
      )
    )
  );

-- 4. Aggregate recompute: revealed-only, and recompute BOTH parties because a
--    counterpart submission reveals two reviews at once (one about each user).
CREATE OR REPLACE FUNCTION public.recompute_profile_rating(p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.creator_profiles cp SET
    average_rating = COALESCE((
      SELECT ROUND(AVG(r.rating::numeric), 2) FROM public.project_reviews r
      WHERE r.reviewee_id = p_user AND r.review_type = 'business_to_creator' AND r.is_public
        AND (public.has_counterpart_review(r.reviewer_id, r.reviewee_id, r.collaboration_id, r.sponsorship_id) OR now() >= r.reveal_at)
    ), 0),
    total_reviews = (
      SELECT COUNT(*) FROM public.project_reviews r
      WHERE r.reviewee_id = p_user AND r.review_type = 'business_to_creator' AND r.is_public
        AND (public.has_counterpart_review(r.reviewer_id, r.reviewee_id, r.collaboration_id, r.sponsorship_id) OR now() >= r.reveal_at)
    )
  WHERE cp.user_id = p_user;

  UPDATE public.business_profiles bp SET
    average_rating = COALESCE((
      SELECT ROUND(AVG(r.rating::numeric), 2) FROM public.project_reviews r
      WHERE r.reviewee_id = p_user AND r.review_type = 'creator_to_business' AND r.is_public
        AND (public.has_counterpart_review(r.reviewer_id, r.reviewee_id, r.collaboration_id, r.sponsorship_id) OR now() >= r.reveal_at)
    ), 0),
    total_reviews = (
      SELECT COUNT(*) FROM public.project_reviews r
      WHERE r.reviewee_id = p_user AND r.review_type = 'creator_to_business' AND r.is_public
        AND (public.has_counterpart_review(r.reviewer_id, r.reviewee_id, r.collaboration_id, r.sponsorship_id) OR now() >= r.reveal_at)
    )
  WHERE bp.user_id = p_user;
$$;

CREATE OR REPLACE FUNCTION public.update_profile_ratings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_profile_rating(NEW.reviewee_id);
  PERFORM public.recompute_profile_rating(NEW.reviewer_id);
  RETURN NEW;
END;
$$;
-- Existing trigger update_profile_ratings_trigger already calls this function; no trigger change needed.

-- One-time recompute so existing aggregates reflect the revealed-only rule.
DO $$
DECLARE u uuid;
BEGIN
  FOR u IN (SELECT DISTINCT reviewee_id FROM public.project_reviews) LOOP
    PERFORM public.recompute_profile_rating(u);
  END LOOP;
END $$;

-- 5. Public reviews view: revealed-only, profile + project title flattened to
--    plain columns (no PostgREST FK embeds). security_invoker so base RLS also
--    applies. The WHERE is the display filter; RLS (section 3) is the security boundary.
CREATE OR REPLACE VIEW public.public_project_reviews
WITH (security_invoker = true) AS
SELECT
  r.id, r.collaboration_id, r.sponsorship_id, r.reviewer_id, r.reviewee_id,
  r.rating, r.review_text, r.review_type,
  r.communication_rating, r.quality_rating, r.timeliness_rating, r.professionalism_rating,
  r.is_public, r.created_at, r.updated_at, r.reveal_at,
  p.full_name  AS reviewer_full_name,
  p.avatar_url AS reviewer_avatar_url,
  COALESCE(c_collab.title, c_spon.title, 'Project') AS project_title
FROM public.project_reviews r
LEFT JOIN public.profiles p                 ON p.id = r.reviewer_id
LEFT JOIN public.campaign_collaborations cc ON cc.id = r.collaboration_id
LEFT JOIN public.campaigns c_collab         ON c_collab.id = cc.campaign_id
LEFT JOIN public.campaign_sponsorships cs   ON cs.id = r.sponsorship_id
LEFT JOIN public.campaigns c_spon           ON c_spon.id = cs.campaign_id
WHERE r.is_public
  AND (
    public.has_counterpart_review(r.reviewer_id, r.reviewee_id, r.collaboration_id, r.sponsorship_id)
    OR now() >= r.reveal_at
  );

GRANT SELECT ON public.public_project_reviews TO anon, authenticated;

-- 6. Harden the SECURITY DEFINER surface. recompute_profile_rating and
--    update_profile_ratings are only ever invoked internally (the AFTER trigger
--    and PERFORM), never as PostgREST RPC — revoke client EXECUTE so they can't
--    be called over /rest/v1/rpc. has_counterpart_review is intentionally left
--    executable: the RLS policy and the view call it as the querying user, and
--    it returns only a boolean.
REVOKE ALL ON FUNCTION public.recompute_profile_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_profile_ratings() FROM PUBLIC, anon, authenticated;
