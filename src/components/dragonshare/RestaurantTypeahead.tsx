// src/components/dragonshare/RestaurantTypeahead.tsx
import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X, Loader2 } from 'lucide-react';
import { useRestaurantSearch } from '@/hooks/useRestaurantSearch';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';
import { useNavigate } from 'react-router-dom';

interface Props {
  selectedOrg: RestaurantSearchResult | null;
  onSelect: (org: RestaurantSearchResult) => void;
  onClear: () => void;
}

function OrgInitial({ name }: { name: string }) {
  return (
    <div className="h-8 w-8 rounded-lg bg-dc-teal/20 flex items-center justify-center text-xs font-bold text-dc-teal flex-shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function ResultRow({ org, onSelect }: { org: RestaurantSearchResult; onSelect: () => void }) {
  const resolvedLogo = useResolvedLogoUrl(org.logo_url);
  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left hover:bg-dc-teal/5 transition-colors"
    >
      {resolvedLogo ? (
        <img src={resolvedLogo} alt="" className="h-8 w-8 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <OrgInitial name={org.name} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-dc-text truncate">{org.name}</p>
        {org.address && (
          <p className="text-xs text-dc-text-muted truncate">{org.address}</p>
        )}
      </div>
      {org.brand_category && (
        <span className="text-[10px] bg-dc-teal/10 text-dc-teal-btn px-2 py-0.5 rounded-full font-medium flex-shrink-0 capitalize">
          {org.brand_category}
        </span>
      )}
    </button>
  );
}

export function RestaurantTypeahead({ selectedOrg, onSelect, onClear }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: results, isLoading, isFetching } = useRestaurantSearch(search, open);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (selectedOrg) {
    return (
      <SelectedChip org={selectedOrg} onClear={onClear} />
    );
  }

  const showDropdown = open && search.trim().length > 0;
  const showLoading = showDropdown && (isLoading || isFetching);
  const showEmpty = showDropdown && !isLoading && !isFetching && (results?.length ?? 0) === 0;
  const showResults = showDropdown && !isLoading && (results?.length ?? 0) > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dc-teal" />
        <Input
          placeholder="Search restaurants..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="rounded-xl pl-9 border-dc-teal/30 focus-visible:ring-dc-teal/40 bg-dc-teal/[0.03]"
        />
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-dc-teal/20 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="max-h-72 overflow-y-auto p-1.5">
            {showLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 text-dc-teal animate-spin" />
              </div>
            )}
            {showEmpty && (
              <p className="text-sm text-dc-text-muted text-center py-4">
                No restaurants found
              </p>
            )}
            {showResults && results!.map((org) => (
              <ResultRow
                key={org.id}
                org={org}
                onSelect={() => {
                  onSelect(org);
                  setSearch('');
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <div className="border-t border-dc-teal/10 px-3 py-2">
            <button
              onClick={() => navigate('/dashboard/creator/dragonshare/browse')}
              className="text-xs font-semibold text-dc-teal hover:text-dc-teal-dark transition-colors flex items-center gap-1"
            >
              <span>&rarr;</span> Browse all restaurants
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectedChip({ org, onClear }: { org: RestaurantSearchResult; onClear: () => void }) {
  const resolvedLogo = useResolvedLogoUrl(org.logo_url);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dc-teal/30 bg-dc-teal/5 px-3 py-2">
      {resolvedLogo ? (
        <img src={resolvedLogo} alt="" className="h-6 w-6 rounded-full ring-1 ring-dc-teal/30 object-cover" />
      ) : (
        <div className="h-6 w-6 rounded-full bg-dc-teal/20 flex items-center justify-center text-[10px] font-bold text-dc-teal">
          {org.name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-sm font-medium text-dc-text flex-1 truncate">{org.name}</span>
      <button onClick={onClear} className="text-dc-text-muted hover:text-dc-text p-0.5">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
