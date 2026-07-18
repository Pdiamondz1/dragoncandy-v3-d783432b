import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { useCreatorSocialStats } from '@/hooks/outstand/useCreatorSocialStats';
import { formatCompactNumber } from '@/lib/utils';
import { AppCard } from '@/components/app/AppCard';

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'IG',
  tiktok: 'TT',
  facebook: 'FB',
  x: 'X',
  youtube: 'YT',
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-[#E1306C]',
  tiktok: 'bg-black',
  facebook: 'bg-[#1877F2]',
  x: 'bg-gray-800',
  youtube: 'bg-red-600',
};

interface VerifiedSocialStatsProps {
  userId: string;
}

export const VerifiedSocialStats: React.FC<VerifiedSocialStatsProps> = ({ userId }) => {
  const { data, isLoading } = useCreatorSocialStats(userId);

  if (isLoading || !data || data.platforms.length === 0) return null;

  return (
    <AppCard className="mx-4 mb-3 p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <BadgeCheck className="h-4 w-4 fill-dc-teal text-white" />
        <h2 className="text-sm font-bold text-gray-900">Verified Social Stats</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {data.platforms.map(({ platform, followers }) => (
          <div
            key={platform}
            className="flex items-center gap-2 bg-dc-teal/[0.04] rounded-xl px-3 py-2 min-w-fit"
          >
            <div
              className={`w-6 h-6 ${PLATFORM_COLORS[platform] ?? 'bg-dc-teal-btn'} rounded-md flex items-center justify-center text-white text-[9px] font-bold`}
            >
              {PLATFORM_LABELS[platform] ?? platform.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-extrabold text-gray-900 leading-none">
                {formatCompactNumber(followers)}
              </p>
              <p className="text-[9px] text-gray-400">followers</p>
            </div>
          </div>
        ))}
      </div>
      {data.totalFollowers > 0 && (
        <p className="text-[10px] text-gray-400 mt-2">
          {formatCompactNumber(data.totalFollowers)} total followers · Verified by DragonCandy
        </p>
      )}
    </AppCard>
  );
};
