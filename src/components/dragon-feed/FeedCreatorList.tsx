import React from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { FeedCreatorRow } from './FeedCreatorRow';
import type { FeedCreator } from '@/lib/feedCreators';

interface FeedCreatorListProps {
  creators: FeedCreator[];
  searchTerm: string;
  locationActive: boolean;
  /** Business feed only — a "Browse all creators →" escape hatch. Omitted on the creator feed. */
  browseAllHref?: string;
}

export const FeedCreatorList: React.FC<FeedCreatorListProps> = ({
  creators,
  searchTerm,
  locationActive,
  browseAllHref,
}) => {
  const browseAll = browseAllHref ? (
    <div className="pt-2 text-center">
      <Link
        to={browseAllHref}
        className="text-sm font-semibold text-dc-pink-accent hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-dc-teal rounded"
      >
        Browse all creators →
      </Link>
    </div>
  ) : null;

  if (creators.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-dc-teal/12">
              <Search className="h-6 w-6 text-dc-teal-btn" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-dc-text">No creators found</h3>
            <p className="text-center text-dc-text-muted">
              {locationActive
                ? 'Try a wider radius or "Any".'
                : 'Try a different name.'}
            </p>
          </CardContent>
        </Card>
        {browseAll}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {creators.map(creator => (
        <FeedCreatorRow key={creator.creatorId} creator={creator} searchTerm={searchTerm} />
      ))}
      {browseAll}
    </div>
  );
};
