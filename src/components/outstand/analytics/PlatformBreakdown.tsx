import React from 'react';
import type { PlatformMetrics } from '@/hooks/outstand/useAccountMetrics';

const PLATFORM_STYLES: Record<string, { bg: string; icon: string; iconBg: string }> = {
  instagram: { bg: 'bg-pink-50', icon: 'IG', iconBg: 'bg-[#E1306C]' },
  tiktok: { bg: 'bg-gray-50', icon: 'TT', iconBg: 'bg-black' },
  facebook: { bg: 'bg-blue-50', icon: 'FB', iconBg: 'bg-[#1877F2]' },
  x: { bg: 'bg-gray-50', icon: 'X', iconBg: 'bg-gray-800' },
  youtube: { bg: 'bg-red-50', icon: 'YT', iconBg: 'bg-red-600' },
};

interface PlatformBreakdownProps {
  platforms: PlatformMetrics[];
}

export const PlatformBreakdown: React.FC<PlatformBreakdownProps> = ({ platforms }) => {
  if (platforms.length === 0) return null;

  return (
    <div>
      <div className="text-sm font-bold text-gray-900 mb-3">Platform Breakdown</div>
      <div className="flex md:grid md:grid-cols-3 gap-2.5 overflow-x-auto pb-1">
        {platforms.map((p) => {
          const style = PLATFORM_STYLES[p.platform] ?? { bg: 'bg-gray-50', icon: '?', iconBg: 'bg-gray-400' };
          return (
            <div key={p.accountId} className={`${style.bg} rounded-xl p-3 text-center flex-none w-[100px] md:w-auto`}>
              <div className={`w-7 h-7 ${style.iconBg} rounded-lg mx-auto flex items-center justify-center text-white text-[11px] font-bold mb-2`}>
                {style.icon}
              </div>
              <div className="text-base font-extrabold text-gray-900">{p.followers.toLocaleString()}</div>
              <div className="text-[9px] text-gray-400">followers</div>
              {p.followersDelta !== null && (
                <div className={`text-[10px] font-semibold mt-1 ${p.followersDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {p.followersDelta >= 0 ? '▲' : '▼'} {Math.abs(p.followersDelta).toFixed(1)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
