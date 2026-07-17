// supabase/functions/donny-orchestrator/agents/guidance-helpers.ts
// Pure, dependency-free (no https://esm.sh imports) so vitest can load it directly.
// Turns a help article's HTML body into a short plain-text excerpt for Donny's context.

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&mdash;": "—", "&ndash;": "–", "&nbsp;": " ",
};

export function stripHtml(html: string | null | undefined, maxLen = 200): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]*>/g, " ")                                  // drop tags
    .replace(/&[a-zA-Z#0-9]+;/g, (m) => ENTITIES[m] ?? " ")   // decode common entities
    .replace(/\s+/g, " ")                                      // collapse whitespace
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}
