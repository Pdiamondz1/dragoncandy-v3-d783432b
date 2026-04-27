import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

/**
 * Embed a query string using OpenAI text-embedding-3-small.
 * Returns null if the API key is missing or the call fails.
 */
export async function embedQuery(query: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) {
    console.warn("[rag] OPENAI_API_KEY not set — skipping embedding");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
      }),
    });

    if (!response.ok) {
      console.error(`[rag] OpenAI embedding error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("[rag] embedQuery failed:", err);
    return null;
  }
}

/**
 * Retrieve relevant knowledge chunks from donny_knowledge.
 * Uses cosine similarity if an embedding is provided, falls back to FTS.
 */
export async function retrieveContext(
  supabase: SupabaseClient,
  query: string,
  embedding: number[] | null,
  limit = 5
): Promise<string[]> {
  try {
    if (embedding !== null) {
      const { data, error } = await supabase.rpc("match_donny_knowledge", {
        query_embedding: embedding,
        match_count: limit,
      });

      if (!error && data && data.length > 0) {
        return (data as Array<{ content: string }>).map((row) => row.content);
      }

      // Fall through to FTS on empty result or RPC not found
      if (error) {
        console.warn("[rag] cosine RPC failed, falling back to FTS:", error.message);
      }
    }

    // FTS fallback
    const { data: ftsData, error: ftsError } = await supabase
      .from("donny_knowledge")
      .select("content")
      .textSearch("search_vector", query, {
        type: "plain",
        config: "english",
      })
      .limit(limit);

    if (ftsError) {
      console.error("[rag] FTS fallback failed:", ftsError.message);
      return [];
    }

    return (ftsData ?? []).map((row: { content: string }) => row.content);
  } catch (err) {
    console.error("[rag] retrieveContext failed:", err);
    return [];
  }
}
