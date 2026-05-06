import { useState, useEffect, Suspense, lazy, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { HelpDeepLinkEvent } from './deepLinks';

const modules = import.meta.glob('/src/content/help/promotions/*.mdx') as Record<
  string,
  () => Promise<{ default: React.ComponentType }>
>;

function slugToPath(slug: string): string {
  return `/src/content/help/promotions/${slug}.mdx`;
}

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

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) setSlug(null); }}>
      <SheetContent
        side="right"
        className="w-full lg:w-[480px] p-0 flex flex-col sm:max-w-none"
        hideClose
      >
        <SheetHeader className="px-4 py-3 border-b border-gray-100 shrink-0 flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-sm font-bold uppercase tracking-wide text-gray-900">
            Help Brief
          </SheetTitle>
          <Link
            to={`/help/promotions/${slug}`}
            onClick={() => setSlug(null)}
            className="text-dc-teal hover:text-dc-teal/80 transition-colors"
            title="Open full page"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        </SheetHeader>

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
      </SheetContent>
    </Sheet>
  );
}
