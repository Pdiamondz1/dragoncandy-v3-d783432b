-- AIOS PR 6 — Codex gate #3 fix (High): internal Donny conversations persist
-- revenue/cost/strategy tool results in donny_messages. Owner-only RLS meant a
-- founder later REMOVED from user_roles could still read that history. Gate
-- internal-surface rows on CURRENT admin status, not just ownership.
--
-- (donny_tool_executions / donny_actions are handled at write time: donny-chat
-- redacts internal tool outputs before inserting, so no internal data lands in
-- those owner-readable tables at all.)

-- donny_conversations: internal-surface rows require current admin.
DROP POLICY IF EXISTS "Users can read own conversations" ON public.donny_conversations;
CREATE POLICY "Users can read own conversations"
  ON public.donny_conversations FOR SELECT
  USING (
    auth.uid() = user_id
    AND (surface IS DISTINCT FROM 'internal' OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

DROP POLICY IF EXISTS "Users can update own conversations" ON public.donny_conversations;
CREATE POLICY "Users can update own conversations"
  ON public.donny_conversations FOR UPDATE
  USING (
    auth.uid() = user_id
    AND (surface IS DISTINCT FROM 'internal' OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

DROP POLICY IF EXISTS "Users can insert own conversations" ON public.donny_conversations;
CREATE POLICY "Users can insert own conversations"
  ON public.donny_conversations FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (surface IS DISTINCT FROM 'internal' OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

-- donny_messages: same boundary, stated explicitly in the subquery. (The
-- donny_conversations policy above would also apply transitively inside the
-- subquery, but the explicit predicate doesn't rely on that subtlety.)
DROP POLICY IF EXISTS "Users can read own messages" ON public.donny_messages;
CREATE POLICY "Users can read own messages"
  ON public.donny_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.donny_conversations
      WHERE user_id = auth.uid()
        AND (surface IS DISTINCT FROM 'internal' OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

DROP POLICY IF EXISTS "Users can insert own messages" ON public.donny_messages;
CREATE POLICY "Users can insert own messages"
  ON public.donny_messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.donny_conversations
      WHERE user_id = auth.uid()
        AND (surface IS DISTINCT FROM 'internal' OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
