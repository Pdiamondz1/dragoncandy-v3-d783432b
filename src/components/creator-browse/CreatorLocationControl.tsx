import React from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { RADIUS_OPTIONS, type LocationFilter } from '@/lib/creatorLocationFilter';

interface CreatorLocationControlProps {
  location: LocationFilter;
  onChange: (patch: Partial<LocationFilter>) => void;
  hasBusinessLocation: boolean;
}

const chipBase =
  'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border';
const chipOn = 'bg-teal-400 text-white border-teal-400';
const chipOff = 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50';

function buttonLabel(location: LocationFilter, hasBusinessLocation: boolean): string {
  const radius = location.radiusMiles != null ? ` · ${location.radiusMiles} mi` : ' · Any';
  if (location.mode === 'custom') {
    return `${location.center?.label || location.rawQuery || 'Another area'}${radius}`;
  }
  // near_me
  if (!hasBusinessLocation || !location.center) return 'Set your area';
  return `Near ${location.center.label}${radius}`;
}

const Body: React.FC<CreatorLocationControlProps> = ({ location, onChange, hasBusinessLocation }) => (
  <div className="space-y-4">
    {/* Segment toggle */}
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!hasBusinessLocation}
        aria-pressed={location.mode === 'near_me'}
        onClick={() => onChange({ mode: 'near_me', rawQuery: '', status: 'idle' })}
        className={`${chipBase} ${location.mode === 'near_me' ? chipOn : chipOff} ${!hasBusinessLocation ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        Near me
      </button>
      <button
        type="button"
        aria-pressed={location.mode === 'custom'}
        onClick={() => onChange({ mode: 'custom', center: null, status: 'idle' })}
        className={`${chipBase} ${location.mode === 'custom' ? chipOn : chipOff}`}
      >
        Another area
      </button>
    </div>

    {!hasBusinessLocation && location.mode === 'near_me' && (
      <p className="text-xs text-gray-500">
        Add your location in Business Settings to use “near me,” or search another area below.
      </p>
    )}

    {/* Custom city/zip input */}
    {location.mode === 'custom' && (
      <div className="relative">
        <Input
          placeholder="City or ZIP (e.g. Hoboken, 07030)"
          value={location.rawQuery}
          onChange={(e) => onChange({ rawQuery: e.target.value })}
        />
        {location.status === 'resolving' && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
        {location.status === 'failed' && (
          <p className="text-xs text-pink-600 mt-1">Couldn’t find that place — try a nearby city or ZIP.</p>
        )}
      </div>
    )}

    {/* Radius chips */}
    <div>
      <p className="text-xs font-medium text-gray-500 mb-2">Distance</p>
      <div className="flex flex-wrap gap-2">
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={location.radiusMiles === r}
            onClick={() => onChange({ radiusMiles: r })}
            className={`${chipBase} ${location.radiusMiles === r ? chipOn : chipOff}`}
          >
            {r} mi
          </button>
        ))}
        <button
          type="button"
          aria-pressed={location.radiusMiles == null}
          onClick={() => onChange({ radiusMiles: null })}
          className={`${chipBase} ${location.radiusMiles == null ? chipOn : chipOff}`}
        >
          Any
        </button>
      </div>
    </div>
  </div>
);

export const CreatorLocationControl: React.FC<CreatorLocationControlProps> = (props) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const label = buttonLabel(props.location, props.hasBusinessLocation);

  const trigger = (
    <button
      type="button"
      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-teal-400 bg-white text-gray-900 hover:bg-teal-50 transition-colors"
    >
      <MapPin className="h-4 w-4 text-teal-500" />
      <span className="truncate max-w-[220px]">{label}</span>
      <span className="text-xs">▾</span>
    </button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Location</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <Body {...props} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <Body {...props} />
      </PopoverContent>
    </Popover>
  );
};
