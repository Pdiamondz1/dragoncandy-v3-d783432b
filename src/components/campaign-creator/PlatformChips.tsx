import type { Platform } from '@/types/campaignMedia';
import { AppChip } from '@/components/app/AppChip';

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
          <AppChip key={value} active={selected.includes(value)} onClick={() => toggle(value)}>
            {label}
          </AppChip>
        ))}
      </div>
    </div>
  );
}
