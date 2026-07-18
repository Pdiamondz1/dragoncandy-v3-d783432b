import { useState } from 'react';
import { Check, ChevronDown, Plus, Search, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits } from '@/hooks/useOrgData';
import type { OrgUnit } from '@/types/org';
import { Coachmark } from '@/components/guidance/Coachmark';
import { useLocationCampaignCounts } from '@/hooks/useLocationCampaignCounts';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';

interface OrgUnitSwitcherProps {
  onAddUnit?: () => void;
  canManage: boolean;
}

const SEARCH_THRESHOLD = 5;

interface UnitAvatarProps {
  unit: OrgUnit;
  isActive?: boolean;
  size?: 'sm' | 'md';
  /** Resolved org/brand logo URL used as a fallback when the unit has no usable logo. */
  fallbackUrl?: string;
}

function UnitAvatar({ unit, isActive = false, size = 'md', fallbackUrl }: UnitAvatarProps) {
  const sizeClass = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7';
  const ringClass = isActive ? 'ring-2 ring-teal-400' : '';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const resolvedUrl = useResolvedLogoUrl(unit.logo_url);
  const [imgError, setImgError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);

  // Prefer the unit's own logo; degrade to the org logo before the initial-letter fallback,
  // so a missing/broken unit logo never silently drops straight to "U".
  const showingPrimary = !!resolvedUrl && !imgError;
  const src = showingPrimary
    ? resolvedUrl
    : fallbackUrl && !fallbackError
      ? fallbackUrl
      : undefined;

  if (src) {
    return (
      <img
        src={src}
        alt={unit.name}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${ringClass}`}
        onError={() => (showingPrimary ? setImgError(true) : setFallbackError(true))}
      />
    );
  }
  return (
    <span
      className={`${sizeClass} rounded-full bg-teal-500 flex items-center justify-center text-white ${textSize} font-bold shrink-0 ${ringClass}`}
    >
      {unit.name.charAt(0).toUpperCase()}
    </span>
  );
}

interface StatusBadgeProps {
  isReady: boolean;
}

function StatusBadge({ isReady }: StatusBadgeProps) {
  if (isReady) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 shrink-0">
        Ready
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 shrink-0">
      Setup
    </span>
  );
}

interface RichUnitCardProps {
  unit: OrgUnit;
  isActive: boolean;
  campaignCount: number;
  hasSocialAccount: boolean;
  onSelect: (unit: OrgUnit) => void;
  fallbackUrl?: string;
}

function RichUnitCard({ unit, isActive, campaignCount, hasSocialAccount, onSelect, fallbackUrl }: RichUnitCardProps) {
  const isReady = unit.stripe_onboarding_complete === true && hasSocialAccount;
  const statsLabel = campaignCount > 0 ? `${campaignCount} campaign${campaignCount !== 1 ? 's' : ''}` : 'Setup needed';

  return (
    <button
      type="button"
      onClick={() => onSelect(unit)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-teal-50 transition-colors text-left ${isActive ? 'border-l-2 border-teal-400 pl-2.5 bg-teal-50/60' : ''}`}
    >
      <UnitAvatar unit={unit} isActive={isActive} size="md" fallbackUrl={fallbackUrl} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{unit.name}</p>
        <p className="text-xs text-gray-500 truncate">{statsLabel}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <StatusBadge isReady={isReady} />
        {isActive && <Check className="w-4 h-4 text-teal-500" />}
      </div>
    </button>
  );
}

export function OrgUnitSwitcher({ onAddUnit, canManage }: OrgUnitSwitcherProps) {
  const { user, activeOrg, activeOrgUnit, switchOrgUnit } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: units = [] } = useOrgUnits(activeOrg?.id);
  const { data: campaignCounts = [] } = useLocationCampaignCounts(activeOrg?.id);
  const { data: allSocialAccounts = [] } = useLocationSocialAccounts(user?.id);
  const orgLogoUrl = useResolvedLogoUrl(activeOrg?.logo_url);
  const [orgLogoError, setOrgLogoError] = useState(false);

  if (!activeOrg) return null;

  const isRestaurant = activeOrg.org_type === 'restaurant';
  const addLabel = isRestaurant ? '+ Add new location' : '+ Add new product';

  const campaignCountMap = new Map(campaignCounts.map((c) => [c.org_unit_id, c.count]));
  const socialAccountUnitIds = new Set(
    allSocialAccounts.map((a) => a.org_unit_id).filter(Boolean) as string[]
  );

  const showSearch = units.length > SEARCH_THRESHOLD;
  const filteredUnits = showSearch
    ? units.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
    : units;

  const handleSelect = async (unit: OrgUnit | null) => {
    const selectedId = unit?.id ?? null;
    const currentId = activeOrgUnit?.id ?? null;
    if (selectedId === currentId) {
      setOpen(false);
      return;
    }
    try {
      await switchOrgUnit(selectedId);
    } finally {
      setOpen(false);
      setSearch('');
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch('');
  };

  // Single-location: render static pill, no dropdown needed
  if (units.length === 1) {
    const singleUnit = units[0];
    return (
      <Coachmark coachmarkKey="org_switcher" title="Switch units here" body="Manage multiple locations or products from one account.">
        <div
          data-tour="org-switcher"
          className="rounded-full border-2 border-teal-300 bg-white text-teal-600 flex items-center gap-2 px-2 py-1.5"
        >
          <UnitAvatar unit={singleUnit} isActive size="sm" fallbackUrl={orgLogoUrl} />
          <span className="text-sm font-semibold max-w-[120px] truncate">
            {singleUnit.name}
          </span>
        </div>
      </Coachmark>
    );
  }

  return (
    <Coachmark coachmarkKey="org_switcher" title="Switch units here" body="Manage multiple locations or products from one account.">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-tour="org-switcher"
            className="rounded-full border-2 border-teal-300 bg-white text-teal-600 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-2 px-2 py-1.5 h-auto"
          >
            {activeOrgUnit ? (
              <UnitAvatar unit={activeOrgUnit} isActive size="sm" fallbackUrl={orgLogoUrl} />
            ) : (
              <Globe className="w-4 h-4 shrink-0" />
            )}
            <span className="text-sm font-semibold max-w-[120px] truncate">
              {activeOrgUnit?.name ?? (isRestaurant ? 'All Locations' : 'All Products')}
            </span>
            {units.length > 1 && <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-72 p-2 rounded-2xl shadow-lg border border-teal-100">
          {showSearch && (
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-8 h-8 rounded-full text-sm border-dc-teal/20"
              />
            </div>
          )}

          <div className="max-h-72 overflow-y-auto">
            {/* All Locations / All Products row — only when multiple units */}
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-teal-50 transition-colors text-left ${!activeOrgUnit ? 'border-l-2 border-teal-400 pl-2.5 bg-teal-50/60' : ''}`}
            >
              {orgLogoUrl && !orgLogoError ? (
                <img
                  src={orgLogoUrl}
                  alt={isRestaurant ? 'All Locations' : 'All Products'}
                  className={`w-7 h-7 rounded-full object-cover shrink-0 ${!activeOrgUnit ? 'ring-2 ring-teal-400' : ''}`}
                  onError={() => setOrgLogoError(true)}
                />
              ) : (
                <Globe className={`w-7 h-7 text-teal-500 shrink-0 ${!activeOrgUnit ? 'ring-2 ring-teal-400 rounded-full' : ''}`} />
              )}
              <span className="flex-1 text-sm font-semibold text-gray-900">
                {isRestaurant ? 'All Locations' : 'All Products'}
              </span>
              {!activeOrgUnit && <Check className="w-4 h-4 text-teal-500 shrink-0" />}
            </button>

            <div className="border-b border-dc-teal/10 my-1" />

            {filteredUnits.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-4">No results</p>
            ) : (
              filteredUnits.map((unit) => (
                <RichUnitCard
                  key={unit.id}
                  unit={unit}
                  isActive={unit.id === activeOrgUnit?.id}
                  campaignCount={campaignCountMap.get(unit.id) ?? 0}
                  hasSocialAccount={socialAccountUnitIds.has(unit.id)}
                  onSelect={handleSelect}
                  fallbackUrl={orgLogoUrl}
                />
              ))
            )}
          </div>

          {canManage && onAddUnit && (
            <div className="border-t border-dc-teal/10 mt-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAddUnit();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 border border-dashed border-teal-300 rounded-lg hover:bg-teal-50 transition-colors text-sm font-medium text-teal-600"
              >
                <Plus className="w-4 h-4" />
                {addLabel}
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </Coachmark>
  );
}
