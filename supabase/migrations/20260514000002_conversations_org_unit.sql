-- 1. Add org_unit_id column to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_org_unit_id
  ON conversations(org_unit_id);

-- 2. Auto-populate trigger
CREATE OR REPLACE FUNCTION trg_conversations_auto_org_unit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id uuid;
  v_caller  uuid;
BEGIN
  -- If org_unit_id was explicitly set, keep it
  IF NEW.org_unit_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Try to inherit from campaign
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT org_unit_id INTO v_unit_id
      FROM campaigns
     WHERE id = NEW.campaign_id;
    IF v_unit_id IS NOT NULL THEN
      NEW.org_unit_id := v_unit_id;
      RETURN NEW;
    END IF;
  END IF;

  -- Fallback: caller's active org unit
  v_caller := auth.uid();
  IF v_caller IS NOT NULL THEN
    SELECT active_org_unit_id INTO v_unit_id
      FROM profiles
     WHERE id = v_caller;
    NEW.org_unit_id := v_unit_id;  -- may still be NULL
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conversations_auto_org_unit
  BEFORE INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION trg_conversations_auto_org_unit_fn();

-- 3. Recreate get_user_conversations with optional location filter
-- Preserves BOTH existing UNION ALL branches exactly. Only adds p_org_unit_id filter.
DROP FUNCTION IF EXISTS get_user_conversations(uuid);

CREATE OR REPLACE FUNCTION public.get_user_conversations(
  user_uuid uuid,
  p_org_unit_id uuid DEFAULT NULL
)
 RETURNS TABLE(conversation_id uuid, conversation_type text, conversation_title text, last_message_at timestamp with time zone, unread_count bigint, other_participant_name text, other_participant_avatar text, campaign_id uuid, campaign_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  -- Branch 1: Direct conversations (from conversations table)
  SELECT
    c.id as conversation_id,
    c.type as conversation_type,
    c.title as conversation_title,
    c.last_message_at,
    COALESCE(
      (SELECT COUNT(*) FROM public.messages m
       WHERE m.conversation_id = c.id
       AND m.recipient_id = user_uuid
       AND m.read_at IS NULL), 0
    ) as unread_count,
    CASE WHEN c.type = 'direct' THEN
      (SELECT COALESCE(p.full_name, p.email, 'Unknown User')
       FROM public.conversation_participants cp2
       JOIN public.profiles p ON p.id = cp2.user_id
       WHERE cp2.conversation_id = c.id
       AND cp2.user_id != user_uuid
       AND cp2.left_at IS NULL
       LIMIT 1)
    ELSE c.title
    END as other_participant_name,
    CASE WHEN c.type = 'direct' THEN
      (SELECT p.avatar_url
       FROM public.conversation_participants cp2
       JOIN public.profiles p ON p.id = cp2.user_id
       WHERE cp2.conversation_id = c.id
       AND cp2.user_id != user_uuid
       AND cp2.left_at IS NULL
       LIMIT 1)
    ELSE NULL
    END as other_participant_avatar,
    NULL::uuid as campaign_id,
    NULL::text as campaign_status
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = user_uuid
  AND cp.left_at IS NULL
  AND c.is_archived = false
  AND (p_org_unit_id IS NULL OR c.org_unit_id = p_org_unit_id)

  UNION ALL

  -- Branch 2: Campaign conversations (from campaigns table, using messages)
  SELECT
    NULL::uuid as conversation_id,
    'campaign'::text as conversation_type,
    CONCAT('Campaign: ', camp.title) as conversation_title,
    (SELECT MAX(m.created_at) FROM public.messages m
     WHERE m.campaign_id = camp.id
     AND (m.sender_id = user_uuid OR m.recipient_id = user_uuid)) as last_message_at,
    COALESCE(
      (SELECT COUNT(*) FROM public.messages m
       WHERE m.campaign_id = camp.id
       AND m.recipient_id = user_uuid
       AND m.read_at IS NULL), 0
    ) as unread_count,
    CASE
      WHEN camp.user_id = user_uuid THEN
        (SELECT COALESCE(cp2.creator_name, p.full_name, p.email, 'Creator')
         FROM public.campaign_collaborations cc
         JOIN public.creator_profiles cp2 ON cp2.user_id = cc.creator_id
         LEFT JOIN public.profiles p ON p.id = cc.creator_id
         WHERE cc.campaign_id = camp.id
         LIMIT 1)
      ELSE
        (SELECT COALESCE(bp.business_name, p.full_name, p.email, 'Business Client')
         FROM public.business_profiles bp
         LEFT JOIN public.profiles p ON p.id = camp.user_id
         WHERE bp.user_id = camp.user_id
         LIMIT 1)
    END as other_participant_name,
    CASE
      WHEN camp.user_id = user_uuid THEN
        (SELECT COALESCE(cp2.avatar_url, p.avatar_url)
         FROM public.campaign_collaborations cc
         JOIN public.creator_profiles cp2 ON cp2.user_id = cc.creator_id
         LEFT JOIN public.profiles p ON p.id = cc.creator_id
         WHERE cc.campaign_id = camp.id
         LIMIT 1)
      ELSE
        (SELECT COALESCE(bp.logo_url, p.avatar_url)
         FROM public.business_profiles bp
         LEFT JOIN public.profiles p ON p.id = camp.user_id
         WHERE bp.user_id = camp.user_id
         LIMIT 1)
    END as other_participant_avatar,
    camp.id as campaign_id,
    camp.status::text as campaign_status
  FROM public.campaigns camp
  WHERE EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.campaign_id = camp.id
    AND (m.sender_id = user_uuid OR m.recipient_id = user_uuid)
  )
  AND (
    camp.user_id = user_uuid OR
    EXISTS (
      SELECT 1 FROM public.campaign_collaborations cc
      WHERE cc.campaign_id = camp.id
      AND cc.creator_id = user_uuid
    )
  )
  AND (p_org_unit_id IS NULL OR camp.org_unit_id = p_org_unit_id)

  ORDER BY last_message_at DESC NULLS LAST;
END;
$function$;

-- 4. Update create_or_get_direct_conversation to accept org_unit_id
DROP FUNCTION IF EXISTS create_or_get_direct_conversation(uuid, uuid);

CREATE OR REPLACE FUNCTION create_or_get_direct_conversation(
  user1_uuid uuid,
  user2_uuid uuid,
  p_org_unit_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  SELECT c.id INTO v_conversation_id
  FROM conversations c
  WHERE c.type = 'direct'
    AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = user1_uuid)
    AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = user2_uuid)
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  INSERT INTO conversations (type, org_unit_id)
  VALUES ('direct', p_org_unit_id)
  RETURNING id INTO v_conversation_id;

  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES
    (v_conversation_id, user1_uuid),
    (v_conversation_id, user2_uuid);

  RETURN v_conversation_id;
END;
$$;
