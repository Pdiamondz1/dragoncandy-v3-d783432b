-- Repoint AIOS-surface user_id FKs from profiles(id) to auth.users(id) so that
-- internal-only AIOS users can use the internal surface.
--
-- Background: internal-only AIOS users (profiles.account_scope='internal',
-- introduced with the stakeholder-invite flow in PR #178) intentionally have NO
-- consumer profiles row -- handle_new_user skips creating one and "a null
-- profile is tolerated everywhere". But several AIOS-surface tables foreign-key
-- user_id -> profiles(id), which silently assumes every internal user is also a
-- consumer user. When such a user acts, the insert fails with a foreign-key
-- violation, which the google-workspace-proxy catch block flattens to the
-- opaque message "internal error" (a Supabase PostgrestError is a plain object,
-- not an Error instance):
--   - google_workspace_accounts : Google Workspace connect (oauth_callback upsert)
--   - donny_conversations       : Internal Donny chat
--   - donny_tool_executions     : Internal Donny tool-call logging
--
-- profiles.id IS the auth.users.id (1:1 -- profiles.id references auth.users.id),
-- so repointing these FKs to auth.users(id) is non-destructive: every row that
-- currently satisfies the profiles FK already exists in auth.users. ON DELETE
-- CASCADE is preserved. Consumer-app tables are deliberately left referencing
-- profiles(id) -- internal-only users never write them.

ALTER TABLE public.google_workspace_accounts
  DROP CONSTRAINT google_workspace_accounts_user_id_fkey,
  ADD  CONSTRAINT google_workspace_accounts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.donny_conversations
  DROP CONSTRAINT donny_conversations_user_id_fkey,
  ADD  CONSTRAINT donny_conversations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.donny_tool_executions
  DROP CONSTRAINT donny_tool_executions_user_id_fkey,
  ADD  CONSTRAINT donny_tool_executions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
