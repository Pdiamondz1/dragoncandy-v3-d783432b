import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, BookOpen, Megaphone, Zap, CreditCard, Shield, ChevronDown, ArrowLeft } from "lucide-react";
import { DCSkeleton } from "@/components/ui/dc-skeleton";
import { Button } from "@/components/ui/button";

interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: string;
  roles: string[];
  search_terms: string[];
}

const CATEGORIES = [
  { key: "getting_started", label: "Getting Started", icon: BookOpen },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "dragonshare", label: "DragonShare", icon: Zap },
  { key: "billing", label: "Billing & Plans", icon: CreditCard },
  { key: "account", label: "Account & Privacy", icon: Shield },
] as const;

export default function HelpCenter() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
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

  const filtered = useMemo(() => {
    if (!search.trim()) return articles;
    const q = search.toLowerCase();
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.search_terms.some((t) => t.toLowerCase().includes(q)) ||
        a.body.toLowerCase().includes(q)
    );
  }, [articles, search]);

  const toggleCategory = (key: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-8 lg:py-12">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/dashboard')}
          className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Dashboard
        </Button>

        <h1 className="text-2xl lg:text-3xl font-bold text-dc-dark mb-2">
          Help Center
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Find answers or ask Donny for help
        </p>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search help..."
            className="w-full pl-10 pr-4 py-3 rounded-full border border-gray-200 text-sm focus:outline-none focus:border-dc-teal"
          />
        </div>

        {isLoading && <DCSkeleton variant="list-row" count={5} />}

        {/* Categories */}
        {!isLoading && (
          <div className="space-y-4">
            {CATEGORIES.map(({ key, label, icon: Icon }) => {
              const categoryArticles = filtered.filter(
                (a) => a.category === key
              );
              if (search && categoryArticles.length === 0) return null;
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

                  {isOpen && categoryArticles.length > 0 && (
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
                            {article.body.slice(0, 80)}...
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

        {!isLoading && search && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">
              No articles found for "{search}"
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Try different keywords or ask Donny
            </p>
          </div>
        )}

        {!isLoading && !search && articles.length === 0 && (
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
              onClick={() => navigate('/dashboard')}
            >
              Return to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
