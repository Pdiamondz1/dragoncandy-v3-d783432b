import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";

/**
 * General agent — catch-all for greetings, off-topic questions, and anything
 * not handled by the other specialized agents. Returns only the RAG context
 * passed via input; performs no additional DB queries.
 */
export async function execute(
  _supabase: SupabaseClient,
  input: Record<string, unknown>,
  _userContext: UserContext
): Promise<SubAgentResult> {
  const ragContext = (input.rag_context as string) ?? "";

  return {
    context: ragContext || "No additional context available.",
    suggested_actions: [
      { label: "Explore campaigns", route: "/dashboard" },
      { label: "Visit help center", route: "/help" },
    ],
  };
}
