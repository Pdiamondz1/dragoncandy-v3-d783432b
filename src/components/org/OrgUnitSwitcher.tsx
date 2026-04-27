import { useState } from 'react';
import { Check, ChevronDown, MapPin, Tag, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits, useUpdateActiveUnit } from '@/hooks/useOrgData';
import type { OrgUnit } from '@/types/org';

interface OrgUnitSwitcherProps {
  onAddUnit?: () => void;
  canManage: boolean;
}

const SEARCH_THRESHOLD = 5;

function UnitAvatar({ unit }: { unit: OrgUnit }) {
  if (unit.logo_url) {
    return (
      <img
        src={unit.logo_url}
        alt={unit.name}
        className="w-6 h-6 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {unit.name.charAt(0).toUpperCase()}
    </span>
  );
}

function UnitListItem({
  unit,
  isActive,
  onSelect,
}: {
  unit: OrgUnit;
  isActive: boolean;
  onSelect: (unit: OrgUnit) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(unit)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-teal-50 transition-colors text-left"
    >
      <UnitAvatar unit={unit} />
      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{unit.name}</span>
      {isActive && <Check className="w-4 h-4 text-teal-500 shrink-0" />}
    </button>
  );
}

export function OrgUnitSwitcher({ onAddUnit, canManage }: OrgUnitSwitcherProps) {
  const { activeOrg, activeOrgUnit } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: units = [] } = useOrgUnits(activeOrg?.id);
  const updateActive = useUpdateActiveUnit();

  if (!activeOrg || !activeOrgUnit) return null;

  const isRestaurant = activeOrg.org_type === 'restaurant';
  const OrgIcon = isRestaurant ? MapPin : Tag;
  const addLabel = isRestaurant ? '+ Add new location' : '+ Add new product';

  const showSearch = units.length > SEARCH_THRESHOLD;
  const filteredUnits = showSearch
    ? units.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
    : units;

  const handleSelect = async (unit: OrgUnit) => {
    if (unit.id === activeOrgUnit.id) {
      setOpen(false);
      return;
    }
    try {
      await updateActive.mutateAsync(unit.id);
    } finally {
      setOpen(false);
      setSearch('');
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-tour="org-switcher"
          className="rounded-full border border-teal-300 bg-white text-teal-600 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-1.5 px-3 py-1.5 h-auto"
        >
          <OrgIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="text-sm font-medium max-w-[120px] truncate">{activeOrgUnit.name}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-2 rounded-2xl shadow-lg border border-teal-100">
        {showSearch && (
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 h-8 rounded-full text-sm border-gray-200"
            />
          </div>
        )}

        <div className="max-h-60 overflow-y-auto">
          {filteredUnits.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-4">No results</p>
          ) : (
            filteredUnits.map((unit) => (
              <UnitListItem
                key={unit.id}
                unit={unit}
                isActive={unit.id === activeOrgUnit.id}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>

        {canManage && onAddUnit && (
          <>
            <div className="border-t border-gray-100 mt-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAddUnit();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-teal-50 transition-colors text-sm font-medium text-teal-600"
              >
                <Plus className="w-4 h-4" />
                {addLabel}
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
