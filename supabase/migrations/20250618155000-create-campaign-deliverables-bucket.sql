
-- Create storage bucket for campaign deliverables
INSERT INTO storage.buckets (id, name, public) 
VALUES ('campaign-deliverables', 'campaign-deliverables', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for campaign deliverables
CREATE POLICY "Users can upload campaign deliverables" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'campaign-deliverables' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view campaign deliverables" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'campaign-deliverables');

CREATE POLICY "Users can update their campaign deliverables" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'campaign-deliverables' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their campaign deliverables" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'campaign-deliverables' AND auth.uid()::text = (storage.foldername(name))[1]);
