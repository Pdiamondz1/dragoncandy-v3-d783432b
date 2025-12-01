-- Add location fields to business_profiles table
ALTER TABLE public.business_profiles 
  ADD COLUMN postal_code text,
  ADD COLUMN city text,
  ADD COLUMN country text;