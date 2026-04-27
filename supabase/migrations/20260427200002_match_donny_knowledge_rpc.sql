-- RPC function for cosine similarity search on donny_knowledge
CREATE OR REPLACE FUNCTION public.match_donny_knowledge(
  query_embedding extensions.vector(1536),
  match_count int DEFAULT 5
)
RETURNS TABLE (id uuid, content text, metadata jsonb, similarity float)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dk.id,
    dk.content,
    dk.metadata,
    1 - (dk.embedding <=> query_embedding) AS similarity
  FROM donny_knowledge dk
  WHERE dk.embedding IS NOT NULL
  ORDER BY dk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
