import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Instagram, Facebook, Twitter, Youtube } from 'lucide-react';

// TikTok doesn't exist in lucide-react — inline SVG
const TikTokIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'x' | 'youtube';

export interface SocialHandles {
  instagram: string;
  tiktok: string;
  facebook: string;
  x: string;
  youtube: string;
}

const EMPTY_HANDLES: SocialHandles = {
  instagram: '',
  tiktok: '',
  facebook: '',
  x: '',
  youtube: '',
};

interface PlatformConfig {
  key: SocialPlatform;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  /** Tailwind classes for the focus ring — platform brand color */
  focusRing: string;
  /** Tailwind classes for the icon color on focus */
  iconActive: string;
}

const platforms: PlatformConfig[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    placeholder: '@yourhandle',
    icon: <Instagram className="w-4 h-4" />,
    focusRing: 'focus-within:ring-2 focus-within:ring-pink-500 focus-within:border-pink-400',
    iconActive: 'group-focus-within:text-pink-500',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    placeholder: '@yourhandle',
    icon: <TikTokIcon className="w-4 h-4" />,
    focusRing: 'focus-within:ring-2 focus-within:ring-cyan-400 focus-within:border-cyan-400',
    iconActive: 'group-focus-within:text-cyan-500',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    placeholder: 'Your name or username',
    icon: <Facebook className="w-4 h-4" />,
    focusRing: 'focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-400',
    iconActive: 'group-focus-within:text-blue-600',
  },
  {
    key: 'x',
    label: 'X (Twitter)',
    placeholder: '@yourhandle',
    icon: <Twitter className="w-4 h-4" />,
    focusRing: 'focus-within:ring-2 focus-within:ring-gray-800 focus-within:border-gray-700',
    iconActive: 'group-focus-within:text-gray-900',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    placeholder: '@yourchannel',
    icon: <Youtube className="w-4 h-4" />,
    focusRing: 'focus-within:ring-2 focus-within:ring-red-500 focus-within:border-red-400',
    iconActive: 'group-focus-within:text-red-600',
  },
];

/** Strip leading @ on submit so storage is consistent */
export function sanitizeHandles(handles: SocialHandles): SocialHandles {
  const out = { ...handles };
  for (const key of Object.keys(out) as SocialPlatform[]) {
    out[key] = out[key].trim().replace(/^@/, '');
  }
  return out;
}

interface SocialHandleFieldsProps {
  value: SocialHandles;
  onChange: (handles: SocialHandles) => void;
}

export const SocialHandleFields: React.FC<SocialHandleFieldsProps> = ({
  value,
  onChange,
}) => {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Social Handles <span className="normal-case font-normal text-gray-400">(optional)</span>
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Share your socials so the business can tag you
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {platforms.map((p) => (
          <div
            key={p.key}
            className={[
              'group relative flex items-center rounded-lg border border-gray-200 bg-white',
              'transition-all duration-150',
              p.focusRing,
            ].join(' ')}
          >
            {/* Platform icon */}
            <div
              className={[
                'flex items-center justify-center w-9 h-9 text-gray-400 transition-colors duration-150',
                p.iconActive,
              ].join(' ')}
            >
              {p.icon}
            </div>

            {/* Input */}
            <Input
              value={value[p.key]}
              onChange={(e) => onChange({ ...value, [p.key]: e.target.value })}
              placeholder={p.placeholder}
              className="border-0 shadow-none focus-visible:ring-0 pl-0 text-sm h-9"
              aria-label={p.label}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Convenience hook for managing social handle state in a form.
 */
export function useSocialHandles() {
  const [handles, setHandles] = useState<SocialHandles>(EMPTY_HANDLES);

  const hasAnyHandle = Object.values(handles).some((v) => v.trim().length > 0);

  return {
    handles,
    setHandles,
    hasAnyHandle,
    /** Returns sanitized handles ready for DB storage, or empty object if none filled */
    getSanitized: () => (hasAnyHandle ? sanitizeHandles(handles) : {}),
  };
}
