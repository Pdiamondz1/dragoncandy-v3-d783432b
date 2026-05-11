-- Fix infinite recursion in campaigns RLS policy.
-- The EXISTS subquery on campaign_collaborations triggers RLS policies
-- on that table which reference campaigns, creating a circular dependency.
-- Solution: SECURITY DEFINER function bypasses RLS for the lookup.

CREATE OR REPLACE FUNCTION has_collaboration_on_campaign(p_campaign_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM campaign_collaborations
    WHERE campaign_id = p_campaign_id AND creator_id = p_user_id
  );
$$;

DROP POLICY IF EXISTS "Users can view accessible campaigns" ON campaigns;
CREATE POLICY "Users can view accessible campaigns" ON campaigns FOR SELECT USING (
  user_id = auth.uid()
  OR status = 'published'
  OR has_collaboration_on_campaign(id, auth.uid())
);
