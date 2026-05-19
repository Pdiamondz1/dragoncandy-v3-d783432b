-- Enable realtime for campaign_invitations so creators receive
-- live notifications when they are invited to campaigns
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_invitations;
