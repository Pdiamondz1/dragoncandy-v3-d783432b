import React from 'react';
import { Search, SlidersHorizontal, MapPin } from 'lucide-react';
import type { SortOption } from '@/hooks/useCreatorBrowse';
import { SKILL_OPTIONS } from '@/lib/skillUtils';
import { CreatorLocationControl } from './CreatorLocationControl';
import type { LocationFilter } from '@/lib/creatorLocationFilter';
import { AppChip } from '@/components/app/AppChip';

const CONTENT_TYPES = SKILL_OPTIONS
  .filter(s => s.value !== 'other' && s.value !== 'influencer_marketing' && s.value !== 'illustration')
  .map(s => ({ value: s.value, label: s.label }));

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'nearest', label: 'Nearest first' },
  { value: 'top-rated', label: 'Top Rated' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'most-reviewed', label: 'Most Reviewed' },
];

interface CreatorBrowseHeaderProps {
  resultCount: number;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  contentTypeFilter: string[];
  onContentTypeChange: (types: string[]) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  onOpenFilters: () => void;
  onOpenMap: () => void;
  activeFilterCount: number;
  location?: LocationFilter;
  onLocationChange?: (patch: Partial<LocationFilter>) => void;
  hasBusinessLocation?: boolean;
}

export const CreatorBrowseHeader: React.FC<CreatorBrowseHeaderProps> = ({
  resultCount,
  searchTerm,
  onSearchChange,
  contentTypeFilter,
  onContentTypeChange,
  sortBy,
  onSortChange,
  onOpenFilters,
  onOpenMap,
  activeFilterCount,
  location,
  onLocationChange,
  hasBusinessLocation,
}) => {
  const [isSortOpen, setIsSortOpen] = React.useState(false);
  const sortRef = React.useRef<HTMLDivElement>(null);

  // Close sort dropdown on outside click
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleContentType = (type: string) => {
    if (contentTypeFilter.includes(type)) {
      onContentTypeChange(contentTypeFilter.filter(t => t !== type));
    } else {
      onContentTypeChange([...contentTypeFilter, type]);
    }
  };

  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? 'Relevance';

  // "Nearest first" only makes sense where the location control is wired (restaurant surface).
  const sortOptions = location
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter(o => o.value !== 'nearest');

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-extrabold text-gray-900">Find Creators</h2>
        <p className="text-sm text-gray-500 mt-1">Discover local creators matched to your brand</p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, skill, or location…"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-11 pr-4 py-2.5 bg-white border border-dc-teal/20 rounded-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white transition-colors"
        />
      </div>

      {/* Location + Radius (restaurant surface only) */}
      {location && onLocationChange && (
        <CreatorLocationControl
          location={location}
          onChange={onLocationChange}
          hasBusinessLocation={!!hasBusinessLocation}
        />
      )}

      {/* Content-Type Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide md:overflow-x-visible md:flex-wrap">
        <AppChip
          onClick={() => onContentTypeChange([])}
          active={contentTypeFilter.length === 0}
          className="flex-shrink-0"
        >
          All
        </AppChip>
        {CONTENT_TYPES.map(({ value, label }) => (
          <AppChip
            key={value}
            onClick={() => toggleContentType(value)}
            active={contentTypeFilter.includes(value)}
            className="flex-shrink-0 whitespace-nowrap"
          >
            {label}
          </AppChip>
        ))}
      </div>

      {/* Sort + Filter + Map Row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{resultCount} creator{resultCount !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          {/* Sort Dropdown */}
          <div className="relative" ref={sortRef}>
            <AppChip
              onClick={() => setIsSortOpen(!isSortOpen)}
              active={isSortOpen}
              className="inline-flex items-center gap-1.5"
            >
              Sort: {currentSortLabel} <span className="text-xs">▾</span>
            </AppChip>
            {isSortOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-dc-teal/15 rounded-xl shadow-lg z-50 py-1 min-w-[180px]">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      setIsSortOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-dc-teal/5 transition-colors ${
                      sortBy === option.value ? 'text-teal-600 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filters Button */}
          <AppChip
            onClick={onOpenFilters}
            active={activeFilterCount > 0}
            className="inline-flex items-center gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-teal-400 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {activeFilterCount}
              </span>
            )}
          </AppChip>

          {/* Map Button */}
          <AppChip
            onClick={onOpenMap}
            className="inline-flex items-center gap-1.5"
          >
            <MapPin className="h-3.5 w-3.5" />
            Map
          </AppChip>
        </div>
      </div>
    </div>
  );
};
