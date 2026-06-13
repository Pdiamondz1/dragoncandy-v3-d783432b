-- GW PR 6: Google Chat bot scaffold.
-- Resolve a Chat sender's email to an internal ADMIN user_id, binding identity
-- to auth.users.email ONLY (never profiles.email). service_role-only — called
-- by google-chat-donny AFTER it has verified Google's signed request JWT.
-- Returns NULL when the email isn't a provisioned admin, so the bot denies.
create or replace function public.chat_resolve_admin(p_email text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.id
  from auth.users u
  join public.user_roles r on r.user_id = u.id and r.role = 'admin'::public.app_role
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.chat_resolve_admin(text) from public, anon, authenticated;
grant execute on function public.chat_resolve_admin(text) to service_role;
