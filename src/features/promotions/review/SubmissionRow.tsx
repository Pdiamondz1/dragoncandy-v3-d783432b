import React from 'react';
import { Instagram, Facebook, Twitter, Youtube, ExternalLink } from 'lucide-react';

// TikTok icon (not in lucide-react)
const TikTokIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'x' | 'youtube';

interface PlatformMeta {
  icon: React.ReactNode;
  label: string;
  /** Chip bg + text color classes */
  chipClasses: string;
  /** Build profile URL from handle */
  profileUrl: (handle: string) => string;
}

const PLATFORM_META: Record<SocialPlatform, PlatformMeta> = {
  instagram: {
    icon: <Instagram className="w-3.5 h-3.5" />,
    label: 'Instagram',
    chipClasses: 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100',
    profileUrl: (h) => `https://instagram.com/${h}`,
  },
  tiktok: {
    icon: <TikTokIcon className="w-3.5 h-3.5" />,
    label: 'TikTok',
    chipClasses: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100',
    profileUrl: (h) => `https://tiktok.com/@${h}`,
  },
  facebook: {
    icon: <Facebook className="w-3.5 h-3.5" />,
    label: 'Facebook',
    chipClasses: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    profileUrl: (h) => `https://facebook.com/${h}`,
  },
  x: {
    icon: <Twitter className="w-3.5 h-3.5" />,
    label: 'X',
    chipClasses: 'bg-dc-dark/5 text-dc-text border-dc-dark/20 hover:bg-dc-dark/10',
    profileUrl: (h) => `https://x.com/${h}`,
  },
  youtube: {
    icon: <Youtube className="w-3.5 h-3.5" />,
    label: 'YouTube',
    chipClasses: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    profileUrl: (h) => `https://youtube.com/@${h}`,
  },
};

interface SocialHandleChipsProps {
  socialHandles?: Record<string, string>;
}

/**
 * Renders clickable platform-colored chips for each social handle.
 * Each chip opens the creator's profile on that platform in a new tab.
 */
export const SocialHandleChips: React.FC<SocialHandleChipsProps> = ({ socialHandles }) => {
  if (!socialHandles) return null;

  const entries = (Object.entries(socialHandles) as [SocialPlatform, string][])
    .filter(([, handle]) => handle && handle.trim().length > 0);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {entries.map(([platform, handle]) => {
        const meta = PLATFORM_META[platform];
        if (!meta) return null;

        return (
          <a
            key={platform}
            href={meta.profileUrl(handle)}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
              'transition-colors duration-150 no-underline',
              meta.chipClasses,
            ].join(' ')}
            title={`${meta.label}: @${handle}`}
          >
            {meta.icon}
            <span className="max-w-[100px] truncate">@{handle}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-50" />
          </a>
        );
      })}
    </div>
  );
};
