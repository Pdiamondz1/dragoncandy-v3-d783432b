-- Campaign owners can view profiles of creators in their campaigns
CREATE POLICY "Campaign owners can view collaborator profiles"
ON public.profiles
FOR SELECT
USING (
  id IN (
    SELECT cc.creator_id
    FROM campaign_collaborations cc
    JOIN campaigns c ON c.id = cc.campaign_id
    WHERE c.user_id = auth.uid()
  )
  OR
  id IN (
    SELECT ca.creator_id
    FROM campaign_applications ca
    JOIN campaigns c ON c.id = ca.campaign_id
    WHERE c.user_id = auth.uid()
      AND ca.status IN ('accepted', 'pending', 'counter_offered')
  )
);

-- Creators can view profiles of campaign owners they're working with
CREATE POLICY "Creators can view campaign owner profiles"
ON public.profiles
FOR SELECT
USING (
  id IN (
    SELECT c.user_id
    FROM campaigns c
    JOIN campaign_collaborations cc ON cc.campaign_id = c.id
    WHERE cc.creator_id = auth.uid()
  )
  OR
  id IN (
    SELECT c.user_id
    FROM campaigns c
    JOIN campaign_applications ca ON ca.campaign_id = c.id
    WHERE ca.creator_id = auth.uid()
  )
);
