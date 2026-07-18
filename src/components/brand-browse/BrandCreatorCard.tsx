import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Bookmark, Send, Star, Instagram, Youtube } from 'lucide-react';
import { CreatorProfileModal } from '@/components/creator-browse/CreatorProfileModal';
import { VerifiedBadge } from '@/components/outstand/VerifiedBadge';
import { useVerifiedStatus } from '@/hooks/outstand/useVerifiedStatus';
import { useCreatorSocialStats } from '@/hooks/outstand/useCreatorSocialStats';
import type { CreatorProfile } from '@/hooks/useCreatorBrowse';
import { formatSkillLabel } from '@/lib/skillUtils';

interface BrandCreatorCardProps {
  creator: CreatorProfile;
  isShortlisted: boolean;
  onToggleShortlist: (creatorId: string) => void;
  onInvite: (creatorId: string) => void;
  shortlistLoading?: boolean;
}

export const BrandCreatorCard: React.FC<BrandCreatorCardProps> = ({
  creator,
  isShortlisted,
  onToggleShortlist,
  onInvite,
  shortlistLoading,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { isVerified } = useVerifiedStatus(creator.user_id);
  const { data: socialStats } = useCreatorSocialStats(creator.user_id);

  useEffect(() => {
    const resolveAvatar = async () => {
      if (!creator.avatar_url) return;
      if (creator.avatar_url.startsWith('http')) {
        setAvatarUrl(creator.avatar_url);
        return;
      }
      try {
        const { data } = await supabase.storage
          .from('profile-assets')
          .createSignedUrl(creator.avatar_url, 3600);
        if (data?.signedUrl) setAvatarUrl(data.signedUrl);
      } catch {
        // fall through
      }
    };
    resolveAvatar();
  }, [creator.avatar_url]);

  const initials = (creator.creator_name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const locationStr = [creator.city, creator.country].filter(Boolean).join(', ');
  const visibleSkills = (creator.skills ?? []).slice(0, 2);
  const overflowCount = (creator.skills?.length ?? 0) - 2;

  // Platform icons
  const platforms: { name: string; icon: React.ReactNode; url: string }[] = [];
  if (creator.instagram_url) platforms.push({ name: 'IG', icon: <Instagram className="h-3 w-3" />, url: creator.instagram_url });
  if (creator.tiktok_url) platforms.push({ name: 'TT', icon: <span className="text-[10px] font-bold">TT</span>, url: creator.tiktok_url });
  if (creator.youtube_url) platforms.push({ name: 'YT', icon: <Youtube className="h-3 w-3" />, url: creator.youtube_url });

  return (
    <>
      <div className="bg-white border border-dc-teal/15 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        {/* Clickable card body */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="w-full text-left p-4 pb-2"
        >
          {/* Avatar + Name row */}
          <div className="flex items-center gap-3 mb-2">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={creator.creator_name}
                className="w-12 h-12 rounded-full ring-2 ring-dc-teal object-cover flex-shrink-0"
                loading="lazy"
                onError={() => setAvatarUrl(null)}
              />
            ) : (
              <div className="w-12 h-12 rounded-full ring-2 ring-dc-teal bg-gradient-to-br from-dc-teal to-dc-teal-dark flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">{initials}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-gray-900 text-sm truncate">{creator.creator_name}</span>
                {isVerified && <VerifiedBadge size="sm" />}
                {creator.average_rating != null && (
                  <span className="flex items-center gap-0.5 text-xs text-yellow-500 flex-shrink-0">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {creator.average_rating.toFixed(1)}
                  </span>
                )}
              </div>
              {locationStr && (
                <p className="text-xs text-gray-500 truncate">{locationStr}</p>
              )}
            </div>
          </div>

          {/* Skill tags */}
          {visibleSkills.length > 0 && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {visibleSkills.map((skill) => (
                <span
                  key={skill}
                  className="bg-teal-50 text-teal-700 rounded-full text-[11px] px-2 py-0.5 font-medium"
                >
                  {formatSkillLabel(skill)}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="text-gray-400 text-[11px] py-0.5">+{overflowCount}</span>
              )}
            </div>
          )}

          {/* Platform icons + rate */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {platforms.slice(0, 3).map((p) => (
                <span
                  key={p.name}
                  className="w-5 h-5 rounded-full bg-dc-teal/10 flex items-center justify-center text-gray-500"
                >
                  {p.icon}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {creator.total_reviews != null && creator.total_reviews > 0 && (
                <span>{creator.total_reviews} review{creator.total_reviews !== 1 ? 's' : ''}</span>
              )}
              {creator.base_rate_per_hour != null && (
                <span className="font-semibold text-gray-700">${creator.base_rate_per_hour}/hr</span>
              )}
            </div>
          </div>
        </button>

        {/* Social metrics row */}
        {socialStats && (socialStats.platforms.length > 0 || socialStats.avgEngagementRate != null) && (
          <div className="flex items-center gap-2 px-4 pb-2 overflow-x-auto">
            {socialStats.platforms.slice(0, 3).map(({ platform, followers }) => (
              <span key={platform} className="text-[10px] text-gray-500 flex items-center gap-1 whitespace-nowrap">
                {platform === 'instagram' ? (
                  <Instagram className="h-3 w-3" />
                ) : platform === 'youtube' ? (
                  <Youtube className="h-3 w-3" />
                ) : platform === 'tiktok' ? (
                  <span className="text-[10px] font-bold">TT</span>
                ) : (
                  <span className="text-[10px] font-bold">X</span>
                )}
                {followers >= 1000 ? `${(followers / 1000).toFixed(1)}K` : followers}
              </span>
            ))}
            {socialStats.totalFollowers > 0 && (
              <span className="text-[10px] bg-dc-teal/10 text-dc-teal font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                {socialStats.totalFollowers >= 1000
                  ? `${(socialStats.totalFollowers / 1000).toFixed(1)}K total`
                  : `${socialStats.totalFollowers} total`}
              </span>
            )}
            {socialStats.avgEngagementRate != null && (
              <span className="text-[10px] bg-dc-teal text-white font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                {socialStats.avgEngagementRate.toFixed(1)}% eng
              </span>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 px-4 pb-3 pt-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleShortlist(creator.user_id);
            }}
            disabled={shortlistLoading}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-semibold transition-colors ${
              isShortlisted
                ? 'bg-pink-50 text-pink-600 border border-pink-200'
                : 'bg-dc-teal/5 text-dc-text-muted hover:bg-dc-teal/10'
            }`}
          >
            <Bookmark className={`h-4 w-4 ${isShortlisted ? 'fill-pink-400' : ''}`} />
            {isShortlisted ? 'Saved' : 'Save'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInvite(creator.user_id);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-dc-teal-btn text-white rounded-full text-sm font-semibold hover:bg-dc-teal-btn-hover transition-colors"
          >
            <Send className="h-4 w-4" />
            Invite
          </button>
        </div>
      </div>

      <CreatorProfileModal
        creator={creator}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};
