
-- Create storage bucket for campaign files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('campaign-files', 'campaign-files', true);

-- Create storage policies for campaign files
CREATE POLICY "Users can upload campaign files" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'campaign-files');

CREATE POLICY "Users can view campaign files" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'campaign-files');

CREATE POLICY "Users can update their campaign files" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'campaign-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their campaign files" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'campaign-files' AND auth.uid()::text = (storage.foldername(name))[1]);
