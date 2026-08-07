-- Phase 1 restaurant onboarding: store selected cuisines on the business profile.
-- Replaces the meaningless "industry" signal for restaurants (industry stays 'food').
alter table public.business_profiles
  add column if not exists cuisines text[] not null default '{}';

comment on column public.business_profiles.cuisines is
  'Restaurant cuisine slugs (app-owned list in src/lib/cuisines.ts). Empty for brand accounts.';
