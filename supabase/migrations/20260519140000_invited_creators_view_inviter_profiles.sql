-- Allow creators to view the profile of users who invited them to campaigns
CREATE POLICY "Invited creators can view inviter profiles"
ON public.profiles FOR SELECT
USING (
  id IN (
    SELECT c.user_id
    FROM campaigns c
    JOIN campaign_invitations ci ON ci.campaign_id = c.id
    WHERE ci.creator_id = auth.uid()
    AND ci.status IN ('pending', 'accepted')
  )
);
