-- 1. Lock down financial columns: only service role (edge functions) can read these.
-- Frontend never selects these directly; all access is via edge functions.
REVOKE SELECT (pending_balance, stripe_account_id, stripe_onboarding_complete) ON public.creator_profiles FROM anon, authenticated;
REVOKE SELECT (pending_balance, stripe_account_id, stripe_onboarding_complete) ON public.business_profiles FROM anon, authenticated;

-- 2. Realtime channel authorization
-- Restrict who can subscribe to realtime broadcasts/presence based on topic naming.
-- Topics used in this app:
--   - conversation:<conversation_id>  (messages)
--   - donny:<user_id>                 (donny_messages, donny_nudges)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read own donny topic" ON realtime.messages;
CREATE POLICY "Authenticated users can read own donny topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Donny topics scoped to the user's own id
  (realtime.topic() LIKE 'donny:%' AND realtime.topic() = 'donny:' || auth.uid()::text)
  OR
  -- Conversation topics scoped to participants
  (realtime.topic() LIKE 'conversation:%' AND public.is_conversation_participant(
    substring(realtime.topic() FROM 'conversation:(.+)')::uuid,
    auth.uid()
  ))
  OR
  -- Postgres changes (table-level RLS on the underlying table still applies)
  extension = 'postgres_changes'
);

DROP POLICY IF EXISTS "Authenticated users can broadcast to own topics" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast to own topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() LIKE 'donny:%' AND realtime.topic() = 'donny:' || auth.uid()::text)
  OR
  (realtime.topic() LIKE 'conversation:%' AND public.is_conversation_participant(
    substring(realtime.topic() FROM 'conversation:(.+)')::uuid,
    auth.uid()
  ))
);