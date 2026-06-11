-- AIOS PR 5: scope internal knowledge so consumer Donny can never surface it.
-- Codex gate #1 finding: the old SELECT policy was USING (true) for all
-- authenticated users, so RPC-level filters alone could not stop a direct
-- PostgREST read of internal rows. This migration closes every path:
--   1. real `scope` column (NULL = consumer)
--   2. scope-aware RLS (internal rows require is_internal_user())
--   3. match_donny_knowledge 3-arg swap, consumer-safe by default, with an
--      IN-FUNCTION gate on the internal scope (the fn is SECURITY DEFINER and
--      PostgREST-callable, so the default alone is not a boundary)

ALTER TABLE public.donny_knowledge ADD COLUMN IF NOT EXISTS scope text;

CREATE INDEX IF NOT EXISTS idx_donny_knowledge_scope
  ON public.donny_knowledge (scope) WHERE scope IS NOT NULL;

-- 2. RLS hardening: replace the blanket authenticated read.
DROP POLICY IF EXISTS "Authenticated users can read knowledge" ON public.donny_knowledge;
DROP POLICY IF EXISTS "donny_knowledge_scoped_select" ON public.donny_knowledge;
CREATE POLICY "donny_knowledge_scoped_select" ON public.donny_knowledge
  FOR SELECT TO authenticated
  USING (scope IS NULL OR scope <> 'internal' OR public.is_internal_user());

-- 3. Atomic signature swap (drop-then-create avoids ambiguous PostgREST overloads).
DROP FUNCTION IF EXISTS public.match_donny_knowledge(extensions.vector, integer);

CREATE FUNCTION public.match_donny_knowledge(
  query_embedding extensions.vector,
  match_count integer DEFAULT 5,
  scope_filter text DEFAULT 'consumer'
)
 RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Internal scope is only for internal users or service-role callers
  -- (edge functions); everyone else gets an exception, not silence, so a
  -- misconfigured caller is loud.
  IF scope_filter = 'internal'
     AND NOT (public.is_internal_user() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'forbidden: internal scope requires internal access';
  END IF;

  RETURN QUERY
  SELECT dk.id, dk.content, dk.metadata,
    1 - (dk.embedding <=> query_embedding) AS similarity
  FROM donny_knowledge dk
  WHERE dk.embedding IS NOT NULL
    AND (
      (scope_filter = 'internal' AND dk.scope = 'internal')
      OR (scope_filter <> 'internal' AND (dk.scope IS NULL OR dk.scope <> 'internal'))
    )
  ORDER BY dk.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;

-- Fresh signature inherits default PUBLIC execute — re-apply grants explicitly
-- (Codex gate #1 finding: the old revoke targeted the 2-arg signature only).
REVOKE EXECUTE ON FUNCTION public.match_donny_knowledge(extensions.vector, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_donny_knowledge(extensions.vector, integer, text) TO authenticated, service_role;
