import React from 'react';
import { Search, SlidersHorizontal, MapPin } from 'lucide-react';
import type { SortOption } from '@/hooks/useCreatorBrowse';

const CONTENT_TYPES = [
  'Video Editing',
  'Photography',
  'UGC Creation',
  'Social Media Management',
  'Copywriting',
  'Graphic Design',
  'Animation',
  'Content Strategy',
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
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
          placeholder="Search creators by name or skill…"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-11 pr-4 py-2.5 bg-gray-100 rounded-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white transition-colors"
        />
      </div>

      {/* Content-Type Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide md:overflow-x-visible md:flex-wrap">
        <button
          onClick={() => onContentTypeChange([])}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            contentTypeFilter.length === 0
              ? 'bg-teal-400 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {CONTENT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => toggleContentType(type)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              contentTypeFilter.includes(type)
                ? 'bg-teal-400 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Sort + Filter + Map Row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{resultCount} creator{resultCount !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          {/* Sort Dropdown */}
          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Sort: {currentSortLabel} <span className="text-xs">▾</span>
            </button>
            {isSortOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 min-w-[180px]">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      setIsSortOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
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
          <button
            onClick={onOpenFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-teal-400 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Map Button */}
          <button
            onClick={onOpenMap}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <MapPin className="h-3.5 w-3.5" />
            Map
          </button>
        </div>
      </div>
    </div>
  );
};
