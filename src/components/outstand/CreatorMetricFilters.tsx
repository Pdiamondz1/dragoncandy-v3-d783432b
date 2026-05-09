import React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SlidersHorizontal } from 'lucide-react';

export interface MetricFilters {
  platforms: string[];
  minFollowers: number;
  minEngagement: number;
  sortBy: 'engagement' | 'followers' | 'recent';
}

const PLATFORM_OPTIONS = ['instagram', 'tiktok', 'youtube', 'x'] as const;

const FOLLOWER_OPTIONS: { label: string; value: number }[] = [
  { label: 'Any', value: 0 },
  { label: '1K+', value: 1000 },
  { label: '5K+', value: 5000 },
  { label: '10K+', value: 10000 },
  { label: '50K+', value: 50000 },
  { label: '100K+', value: 100000 },
];

const ENGAGEMENT_OPTIONS: { label: string; value: number }[] = [
  { label: 'Any', value: 0 },
  { label: '1%+', value: 1 },
  { label: '3%+', value: 3 },
  { label: '5%+', value: 5 },
  { label: '8%+', value: 8 },
];

const SORT_OPTIONS: { label: string; value: MetricFilters['sortBy'] }[] = [
  { label: 'Engagement', value: 'engagement' },
  { label: 'Followers', value: 'followers' },
  { label: 'Recent', value: 'recent' },
];

interface CreatorMetricFiltersProps {
  filters: MetricFilters;
  onChange: (f: MetricFilters) => void;
}

function PillGroup<T extends string | number>({
  options,
  selected,
  onSelect,
}: {
  options: { label: string; value: T }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            selected === opt.value
              ? 'bg-dc-teal text-white border-dc-teal'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function FilterBody({ filters, onChange }: CreatorMetricFiltersProps) {
  const togglePlatform = (p: string) => {
    const next = filters.platforms.includes(p)
      ? filters.platforms.filter((x) => x !== p)
      : [...filters.platforms, p];
    onChange({ ...filters, platforms: next });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Platform</p>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${
                filters.platforms.includes(p)
                  ? 'bg-dc-teal text-white border-dc-teal'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Min Followers</p>
        <PillGroup
          options={FOLLOWER_OPTIONS}
          selected={filters.minFollowers}
          onSelect={(v) => onChange({ ...filters, minFollowers: v })}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Min Engagement</p>
        <PillGroup
          options={ENGAGEMENT_OPTIONS}
          selected={filters.minEngagement}
          onSelect={(v) => onChange({ ...filters, minEngagement: v })}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Sort By</p>
        <PillGroup
          options={SORT_OPTIONS}
          selected={filters.sortBy}
          onSelect={(v) => onChange({ ...filters, sortBy: v })}
        />
      </div>
    </div>
  );
}

export const CreatorMetricFilters: React.FC<CreatorMetricFiltersProps> = ({ filters, onChange }) => {
  const activeCount = [
    filters.platforms.length > 0,
    filters.minFollowers > 0,
    filters.minEngagement > 0,
    filters.sortBy !== 'engagement',
  ].filter(Boolean).length;

  return (
    <>
      {/* Desktop: inline horizontal */}
      <div className="hidden md:block">
        <FilterBody filters={filters} onChange={onChange} />
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Verified Metrics
              {activeCount > 0 && (
                <span className="bg-dc-teal text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                  {activeCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-8">
            <SheetHeader>
              <SheetTitle>Filter by Verified Metrics</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <FilterBody filters={filters} onChange={onChange} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};
