import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";

export async function execute(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
  _userContext: UserContext
): Promise<SubAgentResult> {
  const query = (input.query as string) ?? "";
  const pagePath = (input.page_path as string) ?? "";
  const userRole = (input.user_role as string) ?? "";

  try {
    // Search help_articles by text relevance
    const { data: articles, error } = await supabase
      .from("help_articles")
      .select("id, title, content, category, slug")
      .textSearch("search_vector", query, {
        type: "plain",
        config: "english",
      })
      .limit(5);

    if (error) {
      console.warn("[guidance_agent] text search failed:", error.message);
    }

    // Also fetch page-specific articles if page_path provided
    let pageArticles: Array<{
      id: string;
      title: string;
      content: string;
      category: string;
      slug: string;
    }> = [];

    if (pagePath) {
      const { data } = await supabase
        .from("help_articles")
        .select("id, title, content, category, slug")
        .ilike("related_paths", `%${pagePath}%`)
        .limit(3);
      pageArticles = data ?? [];
    }

    const allArticles = deduplicateById([
      ...(articles ?? []),
      ...pageArticles,
    ]).slice(0, 5);

    const articleRefs = allArticles.map((a) => ({
      title: a.title,
      category: a.category,
      slug: a.slug,
      excerpt: a.content?.slice(0, 200),
    }));

    const suggestedActions: Array<{ label: string; route: string }> = [];

    for (const article of allArticles.slice(0, 2)) {
      suggestedActions.push({
        label: `Read: ${article.title}`,
        route: `/help/${article.slug}`,
      });
    }

    // Role and page-specific fallback actions
    if (suggestedActions.length === 0) {
      if (userRole === "creator") {
        suggestedActions.push({
          label: "View creator help center",
          route: "/help?category=creator",
        });
      } else {
        suggestedActions.push({
          label: "View help center",
          route: "/help",
        });
      }
    }

    const context = {
      articles: articleRefs,
      page_path: pagePath,
      user_role: userRole,
    };

    return {
      context: JSON.stringify(context),
      suggested_actions: suggestedActions,
    };
  } catch (err) {
    console.error("[guidance_agent] error:", err);
    return {
      context: "Unable to fetch guidance articles at this time.",
      suggested_actions: [{ label: "Visit help center", route: "/help" }],
    };
  }
}

function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
