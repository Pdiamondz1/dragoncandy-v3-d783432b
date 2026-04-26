import type { Platform } from '@/types/campaignMedia';
import { cn } from '@/lib/utils';

interface PlatformChipsProps {
  selected: Platform[];
  onChange: (platforms: Platform[]) => void;
}

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'google_business', label: 'Google' },
];

export function PlatformChips({ selected, onChange }: PlatformChipsProps) {
  const toggle = (platform: Platform) => {
    if (selected.includes(platform)) {
      onChange(selected.filter((p) => p !== platform));
    } else {
      onChange([...selected, platform]);
    }
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Platforms</label>
      <div className="flex flex-wrap gap-2 mt-2">
        {PLATFORMS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => toggle(value)}
            className={cn('rounded-full px-3 py-1 text-sm font-medium transition-colors',
              selected.includes(value) ? 'bg-teal-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
