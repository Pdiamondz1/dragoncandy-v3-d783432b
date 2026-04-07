-- P1-5: Auto-expire promotions whose end_date has passed.
-- Uses pg_cron (available on all Supabase projects) to run daily at midnight UTC.

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage so cron jobs can update the promotions table
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create the expiration function
CREATE OR REPLACE FUNCTION public.expire_past_promotions()
RETURNS void AS $$
BEGIN
  UPDATE public.promotions
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND end_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the job to run daily at midnight UTC
SELECT cron.schedule(
  'expire-past-promotions',
  '0 0 * * *',
  $$SELECT public.expire_past_promotions()$$
);
