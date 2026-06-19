-- GW PR 4: brief → Google Doc on publish (idempotent per week).
-- gdoc_id is the exported Doc; gdoc_owner_user_id records whose Drive owns it
-- (drive.file tokens are per-user, so only that user's token can update it).
alter table public.aios_briefings
  add column if not exists gdoc_id text,
  add column if not exists gdoc_owner_user_id uuid references public.profiles(id);
