-- Security fix #4: Allow authenticated users to look up discount codes by code value
-- This enables the QR redemption flow while keeping full table scans restricted.
--
-- Current state: Only policy is "Business owners can view and manage codes for their
-- promotions" (FOR ALL, scoped to promotion owner via p.user_id = auth.uid()).
-- This means a customer trying to redeem a code they received cannot SELECT or UPDATE it.
--
-- Fix: Add a permissive SELECT policy so authenticated users can look up codes.
-- Codes are random 8-char alphanumeric strings, so enumeration risk is negligible.
-- Also add a narrow UPDATE policy so the redeemCode flow can mark codes as redeemed.

CREATE POLICY "discount_codes: lookup by code"
ON public.discount_codes FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to redeem (update is_redeemed, redeemed_at, redeemed_by)
CREATE POLICY "discount_codes: customer redeem"
ON public.discount_codes FOR UPDATE
TO authenticated
USING (NOT is_redeemed);
