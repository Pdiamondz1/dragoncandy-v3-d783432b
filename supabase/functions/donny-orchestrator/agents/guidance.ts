// supabase/functions/donny-orchestrator/agents/guidance.ts
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";
import { stripHtml } from "./guidance-helpers.ts";

export async function execute(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
  _userContext: UserContext
): Promise<SubAgentResult> {
  const query = (input.query as string) ?? "";
  const pagePath = (input.page_path as string) ?? "";
  const userRole = (input.user_role as string) ?? "";

  try {
    // Full-text search over the generated search_vector column (title + body + search_terms).
    const { data: articles, error } = await supabase
      .from("help_articles")
      .select("id, title, body, category, slug")
      .textSearch("search_vector", query, { type: "plain", config: "english" })
      .limit(5);

    if (error) {
      console.warn("[guidance_agent] text search failed:", error.message);
    }

    const allArticles = (articles ?? []).slice(0, 5);

    const articleRefs = allArticles.map((a) => ({
      title: a.title,
      category: a.category,
      slug: a.slug,
      excerpt: stripHtml(a.body, 200),
    }));

    const suggestedActions: Array<{ label: string; route: string }> = [];
    for (const article of allArticles.slice(0, 2)) {
      suggestedActions.push({
        label: `Read: ${article.title}`,
        route: `/help/${article.slug}`,
      });
    }

    // Fallback when the search found nothing.
    if (suggestedActions.length === 0) {
      suggestedActions.push({ label: "View help center", route: "/help" });
    }

    const context = JSON.stringify({
      articles: articleRefs,
      page_path: pagePath,
      user_role: userRole,
    });

    return { context, suggested_actions: suggestedActions };
  } catch (err) {
    console.error("[guidance_agent] error:", err);
    return {
      context: "Unable to fetch guidance articles at this time.",
      suggested_actions: [{ label: "Visit help center", route: "/help" }],
    };
  }
}
