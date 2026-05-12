-- Add donny_ai and messaging categories to help_articles
ALTER TABLE public.help_articles
  DROP CONSTRAINT IF EXISTS help_articles_category_check;

ALTER TABLE public.help_articles
  ADD CONSTRAINT help_articles_category_check
  CHECK (category IN ('getting_started', 'campaigns', 'dragonshare', 'billing', 'account', 'donny_ai', 'messaging'));
