import { useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, BookOpen, Megaphone, Zap, CreditCard, Shield, Sparkles, MessageCircle, ChevronDown, ArrowLeft, Award } from "lucide-react";
import { DCSkeleton } from "@/components/ui/dc-skeleton";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/ui/PageHeader";
import { PublicPageHeader } from '@/components/PublicPageHeader';
import { rankHelpArticles, type HelpArticle } from "@/lib/helpSearch";

const CATEGORIES = [
  { key: "getting_started", label: "Getting Started", icon: BookOpen },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "dragonshare", label: "DragonShare", icon: Zap },
  { key: "donny_ai", label: "Donny AI", icon: Sparkles },
  { key: "messaging", label: "Messaging", icon: MessageCircle },
  { key: "billing", label: "Billing & Plans", icon: CreditCard },
  { key: "account", label: "Account & Privacy", icon: Shield },
  { key: "rewards", label: "Rewards", icon: Award },
] as const;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label])
);

export default function HelpCenter() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(CATEGORIES.map((c) => c.key))
  );

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["help-articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("id, slug, title, body, category, roles, search_terms")
        .order("category")
        .order("title");
      if (error) throw error;
      return (data ?? []) as HelpArticle[];
    },
  });

  // The URL ?q= param IS the search state (no separate useState), so the input and
  // results stay in sync with deep links and browser back/forward with zero drift.
  // Shareable/deep-linkable; replace (not push) so typing doesn't spam history.
  const search = searchParams.get("q") ?? "";
  const setSearch = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("q", value);
        else next.delete("q");
        return next;
      },
      { replace: true }
    );
  };

  const isSearching = search.trim().length > 0;
  const results = useMemo(() => rankHelpArticles(articles, search), [articles, search]);

  const toggleCategory = (key: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const excerpt = (body: string) => body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);

  return (
    <div className="min-h-screen bg-white">
      <PublicPageHeader />
      <SEO
        title="Help Center"
        description="Guides, FAQs, and tutorials for DragonCandy creators, restaurants, and brands."
        path="/help"
      />
      <PageHeader>
        <div className="max-w-2xl lg:max-w-3xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Dashboard
          </Button>
          <h1 className="text-2xl lg:text-3xl font-bold text-dc-dark mb-2">
            Help Center
          </h1>
          <p className="text-sm text-gray-500">Find answers or ask Donny for help</p>
        </div>
      </PageHeader>
      <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-8 lg:py-12">
        {/* Prominent, branded search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dc-teal" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search help articles…"
            aria-label="Search help articles"
            className="w-full pl-12 pr-4 py-4 rounded-full border-2 border-gray-200 text-base shadow-sm focus:outline-none focus:border-dc-teal focus:ring-2 focus:ring-dc-teal/30 transition-colors"
          />
        </div>

        {isLoading && <DCSkeleton variant="list-row" count={5} />}

        {/* Ranked search results */}
        {!isLoading && isSearching && (
          results.length > 0 ? (
            <div>
              <p className="text-xs text-gray-400 mb-3">
                {results.length} result{results.length === 1 ? "" : "s"}
              </p>
              <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden">
                {results.map((article) => (
                  <Link
                    key={article.id}
                    to={`/help/${article.slug}`}
                    className="block px-4 py-3 hover:bg-dc-teal/5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-dc-dark">{article.title}</p>
                      {CATEGORY_LABELS[article.category] && (
                        <span className="text-[10px] uppercase tracking-wide text-dc-teal/70 flex-shrink-0">
                          {CATEGORY_LABELS[article.category]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                      {excerpt(article.body)}…
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">
                No articles found for "{search}"
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Try different keywords or ask Donny
              </p>
            </div>
          )
        )}

        {/* Category browse (when not searching) */}
        {!isLoading && !isSearching && articles.length > 0 && (
          <div className="space-y-4">
            {CATEGORIES.map(({ key, label, icon: Icon }) => {
              const categoryArticles = articles.filter((a) => a.category === key);
              if (categoryArticles.length === 0) return null;
              const isOpen = openCategories.has(key);

              return (
                <div
                  key={key}
                  className="border border-gray-100 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => toggleCategory(key)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-dc-teal flex-shrink-0" />
                    <span className="text-sm font-semibold text-dc-dark flex-1 text-left">
                      {label}
                    </span>
                    <span className="text-xs text-gray-400 mr-2">
                      {categoryArticles.length}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-50 divide-y divide-gray-50">
                      {categoryArticles.map((article) => (
                        <Link
                          key={article.id}
                          to={`/help/${article.slug}`}
                          className="block px-4 py-3 hover:bg-dc-teal/5 transition-colors"
                        >
                          <p className="text-sm font-medium text-dc-dark">
                            {article.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {excerpt(article.body)}…
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* No articles at all */}
        {!isLoading && !isSearching && articles.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <BookOpen className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="text-sm text-gray-500">
              Help articles are coming soon
            </p>
            <p className="text-xs text-gray-400">
              In the meantime, tap Donny for instant answers
            </p>
            <Button
              variant="outline"
              className="rounded-full mt-2"
              onClick={() => navigate('/')}
            >
              Return to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
