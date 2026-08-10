import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDonnyContext } from "@/contexts/DonnyProvider";
import { ArrowLeft, ThumbsUp, ThumbsDown, Sparkles, Mail, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DCSkeleton } from "@/components/ui/dc-skeleton";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/ui/PageHeader";
import { PublicPageHeader } from '@/components/PublicPageHeader';

export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openDonnyWithContext } = useDonnyContext();
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [q, setQ] = useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (query) navigate(`/help?q=${encodeURIComponent(query)}`);
  };

  const { data: article, isLoading } = useQuery({
    queryKey: ["help-article", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("id, title, body, slug")
        .eq("slug", slug)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const feedbackMutation = useMutation({
    mutationFn: async (helpful: boolean) => {
      if (!user || !article) return;
      await supabase.from("help_article_feedback").insert({
        article_id: article.id,
        user_id: user.id,
        helpful,
      });
    },
  });

  const handleFeedback = (helpful: boolean) => {
    setFeedback(helpful);
    feedbackMutation.mutate(helpful);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <PublicPageHeader />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <DCSkeleton variant="text-block" className="h-8 w-64 mb-4" />
          <DCSkeleton variant="text-block" count={5} />
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-white">
        <PublicPageHeader />
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <p className="text-lg font-semibold text-dc-dark">Article not found</p>
            <Link to="/help" className="text-sm text-dc-teal mt-2 inline-block">
              Back to Help Center
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicPageHeader />
      <SEO
        title={`${article.title} - DragonCandy Help`}
        description={article.body?.slice(0, 155) ?? `Help article: ${article.title}`}
        path={`/help/${slug}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": article.title,
          "url": `https://dragoncandy.com/help/${slug}`,
        }}
      />
      <PageHeader>
        <div className="max-w-2xl mx-auto">
          <Link
            to="/help"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-dc-teal mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Help Center
          </Link>
          <h1 className="text-xl lg:text-2xl font-bold text-dc-dark">{article.title}</h1>
          <form onSubmit={submitSearch} className="relative mt-4 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dc-teal" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search all help…"
              aria-label="Search help articles"
              className="w-full pl-9 pr-4 py-2.5 rounded-full border border-gray-200 bg-white text-sm focus:outline-none focus:border-dc-teal focus:ring-2 focus:ring-dc-teal/30 transition-colors"
            />
          </form>
        </div>
      </PageHeader>
      <div className="max-w-2xl mx-auto px-4 py-8 lg:py-12">
        {/* Article content */}
        <article>
          <div
            className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-line [&_img]:rounded-xl [&_img]:shadow-md [&_img]:my-4 [&_img]:max-w-full"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.body) }}
          />
        </article>

        {/* Feedback */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-sm text-gray-500 mb-3">Was this helpful?</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleFeedback(true)}
              disabled={feedback !== null}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                feedback === true
                  ? "border-dc-teal bg-dc-teal/10 text-dc-teal"
                  : "border-gray-200 text-gray-500 hover:border-dc-teal hover:text-dc-teal"
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              Yes
            </button>
            <button
              onClick={() => handleFeedback(false)}
              disabled={feedback !== null}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                feedback === false
                  ? "border-red-300 bg-red-50 text-red-500"
                  : "border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500"
              }`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
              No
            </button>
          </div>
          {feedback !== null && (
            <p className="text-xs text-gray-400 mt-2">Thanks for your feedback!</p>
          )}
        </div>

        {/* CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Button
            variant="dc-primary"
            className="flex-1"
            onClick={() => openDonnyWithContext(`Help me understand: ${article.title}`)}
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            Talk to Donny about this
          </Button>
          <Button variant="dc-outline" className="flex-1" asChild>
            <a href={`mailto:support@dragoncandy.io?subject=Help: ${article.title}`}>
              <Mail className="w-4 h-4 mr-1.5" />
              Email support
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
