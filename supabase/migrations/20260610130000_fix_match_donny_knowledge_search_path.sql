-- Fix: match_donny_knowledge could not resolve the pgvector `<=>` operator on
-- environments where pgvector is installed in the `extensions` schema (e.g. the
-- staging clean-replay), because the function pinned `search_path = 'public'`.
-- Donny's vector RAG silently fell back to full-text search there.
--
-- Add `extensions` to the function's search_path so the operator always resolves.
-- Pure replacement of an existing function — no signature or behavior change.

CREATE OR REPLACE FUNCTION public.match_donny_knowledge(query_embedding extensions.vector, match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT dk.id, dk.content, dk.metadata,
    1 - (dk.embedding <=> query_embedding) AS similarity
  FROM donny_knowledge dk
  WHERE dk.embedding IS NOT NULL
  ORDER BY dk.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;
