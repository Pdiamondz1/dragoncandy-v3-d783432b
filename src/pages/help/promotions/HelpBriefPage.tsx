import React, { Suspense, lazy, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { PublicPageHeader } from '@/components/PublicPageHeader';

/**
 * Valid brief slugs — Vite's import.meta.glob gives us a map of all .mdx files
 * in the content directory. We lazy-load the one matching the URL slug.
 */
const modules = import.meta.glob('/src/content/help/promotions/*.mdx') as Record<
  string,
  () => Promise<{ default: React.ComponentType }>
>;

function slugToPath(slug: string): string {
  return `/src/content/help/promotions/${slug}.mdx`;
}

export default function HelpBriefPage() {
  const { slug } = useParams<{ slug: string }>();

  const MdxComponent = useMemo(() => {
    if (!slug) return null;
    const loader = modules[slugToPath(slug)];
    if (!loader) return null;
    return lazy(loader);
  }, [slug]);

  if (!slug || !MdxComponent) {
    return (
      <div className="min-h-screen bg-white">
        <PublicPageHeader />
        <div className="flex flex-col items-center justify-center p-6 py-16">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Brief not found</h1>
          <p className="text-gray-500 text-sm mb-4">
            The help article "{slug}" doesn't exist.
          </p>
          <Link to="/dashboard/business/promotions" className="text-dc-teal font-medium text-sm">
            ← Back to Promotions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicPageHeader />
      <SEO
        title={`${slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Help'} - DragonCandy Help`}
        description={`DragonCandy help guide for ${slug?.replace(/-/g, ' ') ?? 'promotions'}.`}
        path={`/help/promotions/${slug}`}
      />
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-4 flex items-center gap-3">
        <Link
          to="/dashboard/business/promotions"
          className="text-dc-teal hover:text-dc-teal/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-sans text-sm font-bold uppercase tracking-wide text-gray-900">
          Help
        </h1>
      </header>

      {/* MDX content */}
      <article className="max-w-2xl mx-auto px-5 py-8 prose prose-sm prose-gray prose-headings:text-gray-900 prose-a:text-dc-teal prose-a:no-underline hover:prose-a:underline prose-blockquote:border-dc-teal prose-blockquote:bg-dc-teal/5 prose-blockquote:rounded-lg prose-blockquote:py-2 prose-blockquote:px-4">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-dc-teal" />
            </div>
          }
        >
          <MdxComponent />
        </Suspense>
      </article>
    </div>
  );
}
