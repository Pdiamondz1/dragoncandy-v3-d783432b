-- Plural rich-card payload for Donny messages (avatar creator-discovery cards).
-- Additive + nullable; the existing singular `rich_card` column is untouched.
ALTER TABLE public.donny_messages
  ADD COLUMN IF NOT EXISTS rich_cards jsonb;
