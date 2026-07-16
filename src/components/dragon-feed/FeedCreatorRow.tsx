import React from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { highlightMatch, type FeedCreator } from '@/lib/feedCreators';

interface FeedCreatorRowProps {
  creator: FeedCreator;
  searchTerm: string;
}

export const FeedCreatorRow: React.FC<FeedCreatorRowProps> = ({ creator, searchTerm }) => {
  // creatorSlug can be '' — the || creatorId fallback matters (same route the feed header uses).
  const href = `/creator/${creator.creatorSlug || creator.creatorId}`;
  const nameSegments = highlightMatch(creator.creatorName, searchTerm);

  const location = creator.city || creator.location;
  const hasRating = creator.totalReviews != null && creator.totalReviews > 0 && creator.averageRating != null;
  const meta = [
    location,
    hasRating ? `★ ${creator.averageRating!.toFixed(1)} (${creator.totalReviews})` : null,
    `${creator.postCount} post${creator.postCount === 1 ? '' : 's'}`,
  ].filter(Boolean) as string[];

  const skills = creator.skills.slice(0, 3);

  return (
    <Link
      to={href}
      aria-label={`View ${creator.creatorName}'s profile`}
      className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-white p-3 transition-colors hover:bg-dc-teal/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-dc-teal"
    >
      <Avatar className="h-11 w-11 shrink-0 ring-2 ring-teal-400">
        <AvatarImage src={creator.avatarUrl} alt={creator.creatorName} />
        <AvatarFallback className="text-xs">
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-dc-text">
          {nameSegments.map((seg, i) => (
            <span key={i} className={seg.match ? 'font-bold' : 'font-medium'}>
              {seg.text}
            </span>
          ))}
        </p>
        {meta.length > 0 && (
          <p className="truncate text-xs text-dc-text-muted">{meta.join(' · ')}</p>
        )}
        {skills.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {skills.map(skill => (
              <span
                key={skill}
                className="rounded-full bg-dc-teal/12 px-2 py-0.5 text-[10px] font-medium text-dc-teal-btn"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
};
