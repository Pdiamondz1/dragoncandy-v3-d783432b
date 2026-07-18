// src/components/dragonshare/RestaurantBrowseHeader.tsx
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { AppChip } from '@/components/app/AppChip';

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  cuisines: string[];
  activeCuisine: string | null;
  onCuisineChange: (cuisine: string | null) => void;
  resultCount: number;
}

export function RestaurantBrowseHeader({
  search,
  onSearchChange,
  cuisines,
  activeCuisine,
  onCuisineChange,
  resultCount,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-dc-text-muted" />
        <Input
          placeholder="Search by name or location..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="rounded-full pl-10 h-11 border-dc-teal/20 focus-visible:ring-dc-teal/40"
        />
      </div>

      {/* Cuisine pills + result count */}
      <div className="flex items-center gap-2 flex-wrap">
        <AppChip onClick={() => onCuisineChange(null)} active={!activeCuisine}>
          All
        </AppChip>
        {cuisines.map((cuisine) => (
          <AppChip
            key={cuisine}
            onClick={() => onCuisineChange(activeCuisine === cuisine ? null : cuisine)}
            active={activeCuisine === cuisine}
            className="capitalize"
          >
            {cuisine}
          </AppChip>
        ))}

        <div className="flex-1" />
        <span className="text-xs text-dc-text-muted">
          {resultCount} restaurant{resultCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
