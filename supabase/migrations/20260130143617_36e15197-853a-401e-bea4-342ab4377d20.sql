-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "Users can update their own business profile" 
ON public.business_profiles;

DROP POLICY IF EXISTS "Users can update their own creator profile" 
ON public.creator_profiles;

-- Recreate UPDATE policies with explicit WITH CHECK clause
CREATE POLICY "Users can update their own business profile"
ON public.business_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own creator profile"
ON public.creator_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);