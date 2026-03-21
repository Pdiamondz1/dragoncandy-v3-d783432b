-- Make campaign_id nullable to allow direct conversation messages
ALTER TABLE public.messages 
ALTER COLUMN campaign_id DROP NOT NULL;