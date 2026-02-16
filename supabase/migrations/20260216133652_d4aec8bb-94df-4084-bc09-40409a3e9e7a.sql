
-- Add 'counter_offered' to the application_status enum
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'counter_offered';

-- Create counter-offers table
CREATE TABLE public.application_counter_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES campaign_applications(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('business', 'creator')),
  proposed_rate numeric,
  proposed_timeline text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.application_counter_offers ENABLE ROW LEVEL SECURITY;

-- SELECT: participants can view counter-offers for their applications
CREATE POLICY "Users can view counter-offers for their applications"
ON public.application_counter_offers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM campaign_applications ca
    WHERE ca.id = application_counter_offers.application_id
    AND (
      ca.creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM campaigns c
        WHERE c.id = ca.campaign_id AND c.user_id = auth.uid()
      )
    )
  )
);

-- INSERT: participants can create counter-offers
CREATE POLICY "Users can create counter-offers for their applications"
ON public.application_counter_offers FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM campaign_applications ca
    WHERE ca.id = application_counter_offers.application_id
    AND (
      ca.creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM campaigns c
        WHERE c.id = ca.campaign_id AND c.user_id = auth.uid()
      )
    )
  )
);

-- UPDATE: only the other party (not sender) can accept/decline
CREATE POLICY "Recipients can respond to counter-offers"
ON public.application_counter_offers FOR UPDATE
USING (
  sender_id != auth.uid()
  AND EXISTS (
    SELECT 1 FROM campaign_applications ca
    WHERE ca.id = application_counter_offers.application_id
    AND (
      ca.creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM campaigns c
        WHERE c.id = ca.campaign_id AND c.user_id = auth.uid()
      )
    )
  )
);
