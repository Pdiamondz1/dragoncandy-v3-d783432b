/**
 * Backfill script: generate embeddings for donny_knowledge rows with NULL embedding.
 *
 * Run with:
 *   npx tsx supabase/seed/embed-knowledge.ts
 *
 * Requires env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface KnowledgeRow {
  id: string;
  content: string;
}

async function fetchEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI embeddings API failed: ${err}`);
  }

  const data = await response.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

async function main() {
  console.log("Fetching donny_knowledge rows with NULL embeddings...");

  const { data: rows, error } = await supabase
    .from("donny_knowledge")
    .select("id, content")
    .is("embedding", null);

  if (error) {
    console.error("Failed to fetch rows:", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("No rows with NULL embeddings found — nothing to do.");
    return;
  }

  console.log(`Found ${rows.length} rows to embed.`);

  const BATCH_SIZE = 100;
  let processed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE) as KnowledgeRow[];
    const texts = batch.map((row) => row.content);

    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1} (rows ${i + 1}–${i + batch.length})...`);

    const embeddings = await fetchEmbeddings(texts);

    for (let j = 0; j < batch.length; j++) {
      const { error: updateError } = await supabase
        .from("donny_knowledge")
        .update({ embedding: embeddings[j] })
        .eq("id", batch[j].id);

      if (updateError) {
        console.error(`Failed to update row ${batch[j].id}:`, updateError.message);
      } else {
        processed++;
      }
    }

    console.log(`Progress: ${processed}/${rows.length} rows embedded.`);
  }

  console.log(`Done. ${processed}/${rows.length} rows successfully embedded.`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
