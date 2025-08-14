-- Create creator-portfolios storage bucket for portfolio files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('creator-portfolios', 'creator-portfolios', true);

-- Create RLS policies for creator-portfolios bucket
CREATE POLICY "Public Access for Portfolio Images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'creator-portfolios');

CREATE POLICY "Users can upload their own portfolio files" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'creator-portfolios' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own portfolio files" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'creator-portfolios' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own portfolio files" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'creator-portfolios' AND auth.uid()::text = (storage.foldername(name))[1]);