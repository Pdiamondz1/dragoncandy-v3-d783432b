import React, { useState, useEffect, Suspense, lazy, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X, Loader2, ExternalLink } from 'lucide-react';
import type { HelpDeepLinkEvent } from './deepLinks';

const modules = import.meta.glob('/src/content/help/promotions/*.mdx') as Record<
  string,
  () => Promise<{ default: React.ComponentType }>
>;

function slugToPath(slug: string): string {
  return `/src/content/help/promotions/${slug}.mdx`;
}

/**
 * Responsive drawer that opens when Donny dispatches "donny-help-deep-link".
 * Desktop: right-side panel (drawer). Mobile: full-screen sheet.
 * Mount this once at the app level or inside DashboardLayout.
 */
export function HelpBriefDrawer() {
  const [slug, setSlug] = useState<string | null>(null);
  const open = slug !== null;

  useEffect(() => {
    const handler = (e: CustomEvent<HelpDeepLinkEvent>) => {
      setSlug(e.detail.slug);
    };
    window.addEventListener('donny-help-deep-link', handler as EventListener);
    return () => window.removeEventListener('donny-help-deep-link', handler as EventListener);
  }, []);

  const MdxComponent = useMemo(() => {
    if (!slug) return null;
    const loader = modules[slugToPath(slug)];
    if (!loader) return null;
    return lazy(loader);
  }, [slug]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30 animate-in fade-in duration-200"
        onClick={() => setSlug(null)}
      />

      {/* Panel — full-screen on mobile, right drawer on lg+ */}
      <div className="fixed inset-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[480px] z-[61] bg-white shadow-2xl animate-in slide-in-from-right duration-250 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">Help Brief</h2>
          <div className="flex items-center gap-2">
            <Link
              to={`/help/promotions/${slug}`}
              onClick={() => setSlug(null)}
              className="text-dc-teal hover:text-dc-teal/80 transition-colors"
              title="Open full page"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
            <button
              onClick={() => setSlug(null)}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          {MdxComponent ? (
            <article className="prose prose-sm prose-gray prose-headings:text-gray-900 prose-a:text-dc-teal prose-a:no-underline hover:prose-a:underline prose-blockquote:border-dc-teal prose-blockquote:bg-dc-teal/5 prose-blockquote:rounded-lg prose-blockquote:py-2 prose-blockquote:px-4">
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
          ) : (
            <div className="text-center py-16">
              <p className="text-gray-500 text-sm">Brief "{slug}" not found.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
