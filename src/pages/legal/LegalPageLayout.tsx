import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/ui/PageHeader';
import { PublicPageHeader } from '@/components/PublicPageHeader';

interface LegalPageLayoutProps {
  title: string;
  description: string;
  path: string;
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Shared shell for hosted legal pages (Privacy Policy, Terms of Service).
 * Mirrors the public page pattern used by the Help Center so legal pages
 * present consistently and expose stable, indexable URLs for App Store Connect.
 */
export function LegalPageLayout({
  title,
  description,
  path,
  lastUpdated,
  children,
}: LegalPageLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <PublicPageHeader />
      <SEO title={title} description={description} path={path} />
      <PageHeader>
        <div className="max-w-2xl lg:max-w-3xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to home
          </Button>
          <h1 className="text-2xl lg:text-3xl font-bold text-dc-dark mb-2">{title}</h1>
          <p className="text-sm text-gray-500">Last updated: {lastUpdated}</p>
        </div>
      </PageHeader>
      <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-8 lg:py-12">
        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed prose-headings:text-dc-dark prose-headings:font-semibold prose-a:text-dc-teal prose-a:no-underline hover:prose-a:underline">
          {children}
        </div>
      </div>
    </div>
  );
}
