import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import type {
  ContentTypeFilter,
  DeliveryTierFilter,
  SortOption,
  DistanceRadius,
  BudgetMinPreset,
  BudgetMaxPreset,
  CampaignFilterState,
} from '@/hooks/useCampaignFilters';
import logo from '@/assets/Transparent_DragonCandy_logo.png';

interface CampaignSearchFiltersProps {
  filters: CampaignFilterState;
  filteredCount: number;
  hasActiveFilters: boolean;
  onSearchChange: (term: string) => void;
  onContentTypeChange: (ct: ContentTypeFilter) => void;
  onDeliveryTierChange: (dt: DeliveryTierFilter) => void;
  onSortChange: (sort: SortOption) => void;
  onDistanceChange: (radius: DistanceRadius) => void;
  onBudgetMinChange: (min: BudgetMinPreset) => void;
  onBudgetMaxChange: (max: BudgetMaxPreset) => void;
  onClearFilters: () => void;
}

const CONTENT_TYPE_PILLS: { value: ContentTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'photo', label: 'Photo' },
  { value: 'video', label: 'Video' },
  { value: 'reel', label: 'Reel' },
  { value: 'story', label: 'Story' },
];

const MORE_CONTENT_PILLS: { value: ContentTypeFilter; label: string }[] = [
  { value: 'carousel', label: 'Carousel' },
];

const DELIVERY_TIER_PILLS: { value: DeliveryTierFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'dragonrush', label: 'DragonDash ⚡' },
  { value: 'expedited', label: 'Express' },
  { value: 'standard', label: 'Standard' },
];

const DISTANCE_PILLS: { value: DistanceRadius; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 5, label: '5 mi' },
  { value: 10, label: '10 mi' },
  { value: 25, label: '25 mi' },
  { value: 50, label: '50 mi' },
];

const BUDGET_MIN_PILLS: { value: BudgetMinPreset; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 50, label: '$50+' },
  { value: 100, label: '$100+' },
  { value: 250, label: '$250+' },
];

const BUDGET_MAX_PILLS: { value: BudgetMaxPreset; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 250, label: '≤$250' },
  { value: 500, label: '≤$500' },
  { value: 1000, label: '≤$1k' },
  { value: 2000, label: '≤$2k+' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'newest', label: 'Newest' },
  { value: 'budget', label: 'Highest Budget' },
  { value: 'ending_soon', label: 'Ending Soon' },
];

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
    {children}
  </div>
);

export const CampaignSearchFilters: React.FC<CampaignSearchFiltersProps> = ({
  filters,
  filteredCount,
  hasActiveFilters,
  onSearchChange,
  onContentTypeChange,
  onDeliveryTierChange,
  onSortChange,
  onDistanceChange,
  onBudgetMinChange,
  onBudgetMaxChange,
  onClearFilters,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localSearch, setLocalSearch] = useState(filters.searchTerm);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    setLocalSearch(filters.searchTerm);
  }, [filters.searchTerm]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleSearchInput = (value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(value), 300);
  };

  return (
    <div className="bg-white rounded-b-2xl px-4 pt-3 pb-2 space-y-2">
      {/* Search row */}
      <div className="flex items-center gap-2">
        {searchOpen ? (
          <div className="flex-1 relative">
            <img src={logo} alt="" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search campaigns..."
              value={localSearch}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-full bg-white text-sm text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-dc-teal"
            />
            <button
              onClick={() => {
                setSearchOpen(false);
                onSearchChange('');
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setSearchOpen(true)}
              className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0 hover:border-dc-teal transition-colors"
            >
              <Search className="w-4 h-4 text-gray-500" />
            </button>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {CONTENT_TYPE_PILLS.map((pill) => (
                <button
                  key={pill.value}
                  onClick={() => onContentTypeChange(pill.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filters.contentType === pill.value
                      ? 'bg-dc-teal text-white'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-teal'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0 hover:border-dc-teal transition-colors"
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>
      </div>

      {searchOpen && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {CONTENT_TYPE_PILLS.map((pill) => (
            <button
              key={pill.value}
              onClick={() => onContentTypeChange(pill.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                filters.contentType === pill.value
                  ? 'bg-dc-teal text-white'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-teal'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="space-y-2 pt-1">
          <div>
            <SectionLabel>Delivery Speed</SectionLabel>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {DELIVERY_TIER_PILLS.map((pill) => (
              <button
                key={pill.value}
                onClick={() => onDeliveryTierChange(pill.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  filters.deliveryTier === pill.value
                    ? 'bg-dc-pink text-white'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-pink'
                }`}
              >
                {pill.label}
              </button>
            ))}
            </div>
          </div>

          <div>
            <SectionLabel>More Content Types</SectionLabel>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
              {MORE_CONTENT_PILLS.map((pill) => (
                <button
                  key={pill.value}
                  onClick={() => onContentTypeChange(pill.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filters.contentType === pill.value
                      ? 'bg-dc-teal text-white'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-teal'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Distance</SectionLabel>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
              {DISTANCE_PILLS.map((pill) => (
                <button
                  key={String(pill.value)}
                  onClick={() => onDistanceChange(pill.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filters.distanceRadius === pill.value
                      ? 'bg-dc-teal text-white'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-teal'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Budget Min</SectionLabel>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
              {BUDGET_MIN_PILLS.map((pill) => (
                <button
                  key={String(pill.value)}
                  onClick={() => onBudgetMinChange(pill.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filters.budgetMin === pill.value
                      ? 'bg-dc-teal text-white'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-teal'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Budget Max</SectionLabel>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2.5">
              {BUDGET_MAX_PILLS.map((pill) => (
                <button
                  key={String(pill.value)}
                  onClick={() => onBudgetMaxChange(pill.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filters.budgetMax === pill.value
                      ? 'bg-dc-teal text-white'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-dc-teal'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <select
              value={filters.sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-dc-teal"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {hasActiveFilters && (
              <button
                onClick={onClearFilters}
                className="text-xs text-dc-pink-accent font-semibold hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 px-1">
        {filteredCount} campaign{filteredCount !== 1 ? 's' : ''} available
      </p>
    </div>
  );
};
