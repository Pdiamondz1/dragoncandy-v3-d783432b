-- Expand campaign-deliverables storage access to all active org members,
-- not just the individual user who created the campaign.

DROP POLICY IF EXISTS "Collaboration participants can view deliverables" ON storage.objects;

CREATE POLICY "Collaboration participants can view deliverables"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'campaign-deliverables'
    AND (
      -- Creator (uploader) — their user_id is the first folder segment
      auth.uid()::text = (storage.foldername(name))[1]
      OR
      -- Campaign owner
      EXISTS (
        SELECT 1 FROM file_uploads fu
        JOIN campaigns c ON c.id = fu.campaign_id
        WHERE fu.file_path = name
          AND fu.bucket_name = 'campaign-deliverables'
          AND c.user_id = auth.uid()
      )
      OR
      -- Org member of the campaign's organization
      EXISTS (
        SELECT 1 FROM file_uploads fu
        JOIN campaigns c ON c.id = fu.campaign_id
        JOIN org_members om ON om.org_id = c.org_id
        WHERE fu.file_path = name
          AND fu.bucket_name = 'campaign-deliverables'
          AND om.user_id = auth.uid()
          AND om.invitation_status = 'active'
      )
    )
  );
