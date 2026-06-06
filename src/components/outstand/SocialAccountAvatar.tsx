import { useState } from 'react';
import type { SocialNetwork } from '@outstand-so/ui';
import { cn } from '@/lib/utils';
import { NETWORK_COLORS, NETWORK_LABELS } from './socialNetworks';

export function PlatformIcon({ network }: { network: SocialNetwork | string }) {
  const label = NETWORK_LABELS[network] ?? String(network);
  return (
    <span className="text-[10px] font-bold leading-none text-white select-none">
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

interface SocialAccountAvatarProps {
  network: SocialNetwork | string;
  profilePictureUrl?: string | null;
  /** Used as the image alt text. */
  name?: string;
  /** Tailwind size classes for the circle, e.g. 'w-10 h-10'. Defaults to 'w-10 h-10'. */
  sizeClass?: string;
  className?: string;
}

/**
 * Renders a connected social account's real profile photo, falling back to a
 * two-letter platform code on the network color when there's no photo or the
 * image fails to load. (Profile-photo URLs come from Outstand's
 * `profile_picture_url`; the network CDNs must be allowed in the CSP `img-src`.)
 */
export function SocialAccountAvatar({
  network,
  profilePictureUrl,
  name,
  sizeClass = 'w-10 h-10',
  className,
}: SocialAccountAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const networkColor = NETWORK_COLORS[network] ?? '#6b7280';
  const showFallback = imgError || !profilePictureUrl;

  return (
    <div
      className={cn(
        sizeClass,
        'rounded-full flex items-center justify-center text-white flex-shrink-0 overflow-hidden',
        className,
      )}
      style={{ backgroundColor: networkColor }}
    >
      {showFallback ? (
        <PlatformIcon network={network} />
      ) : (
        <img
          src={profilePictureUrl ?? undefined}
          alt={name ?? NETWORK_LABELS[network] ?? String(network)}
          className="w-full h-full rounded-full object-cover"
          onError={() => setImgError(true)}
        />
      )}
    </div>
  );
}
