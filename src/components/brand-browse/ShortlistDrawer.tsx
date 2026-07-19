import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { X, Send, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { CreatorProfile } from '@/hooks/useCreatorBrowse';
import type { ShortlistedCreator } from '@/hooks/useBrandShortlist';
import type { BrandCampaignItem } from '@/hooks/useBrandActiveCampaigns';
import { formatSkillLabel } from '@/lib/skillUtils';

interface ShortlistDrawerProps {
  shortlist: ShortlistedCreator[];
  creators: CreatorProfile[];
  campaigns: BrandCampaignItem[];
  selectedCampaignId: string | null;
  onSelectCampaign: (id: string | null) => void;
  onRemove: (creatorId: string) => void;
  onBulkInvite: (campaignId: string, creatorIds: string[]) => void;
  isBulkInviting: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ResolvedCreator {
  creator: CreatorProfile;
  avatarUrl: string | null;
}

const ShortlistAvatar: React.FC<{ url: string | null; name: string; size: 'sm' | 'md' }> = ({ url, name, size }) => {
  const [failed, setFailed] = useState(false);
  const initials = name.split(' ').map((w) => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || '?';

  if (size === 'sm') {
    return (url && !failed) ? (
      <img src={url} alt="Creator avatar" className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />
    ) : (
      <span className="text-dc-teal text-xs font-bold">{initials[0]}</span>
    );
  }

  return (url && !failed) ? (
    <img
      src={url}
      alt={name}
      className="w-10 h-10 rounded-full ring-2 ring-dc-teal object-cover flex-shrink-0"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal bg-gradient-to-br from-dc-teal to-dc-teal-dark flex items-center justify-center flex-shrink-0">
      <span className="text-white text-xs font-bold">{initials}</span>
    </div>
  );
};

export const ShortlistDrawer: React.FC<ShortlistDrawerProps> = ({
  shortlist,
  creators,
  campaigns,
  selectedCampaignId,
  onSelectCampaign,
  onRemove,
  onBulkInvite,
  isBulkInviting,
  isOpen,
  onOpenChange,
}) => {
  const [resolvedCreators, setResolvedCreators] = useState<ResolvedCreator[]>([]);

  // Match shortlisted creator_ids to creator profiles
  useEffect(() => {
    const resolve = async () => {
      const entries = shortlist
        .map((item) => ({ item, creator: creators.find((c) => c.user_id === item.creator_id) }))
        .filter((e): e is { item: typeof shortlist[number]; creator: CreatorProfile } => !!e.creator);

      const matched = await Promise.all(
        entries.map(async ({ creator }) => {
          let avatarUrl: string | null = null;
          if (creator.avatar_url) {
            if (creator.avatar_url.startsWith('http')) {
              avatarUrl = creator.avatar_url;
            } else {
              try {
                const { data } = await supabase.storage
                  .from('profile-assets')
                  .createSignedUrl(creator.avatar_url, 3600);
                avatarUrl = data?.signedUrl ?? null;
              } catch {
                // ignore
              }
            }
          }
          return { creator, avatarUrl } as ResolvedCreator;
        })
      );

      setResolvedCreators(matched);
    };

    resolve();
  }, [shortlist, creators]);

  const handleBulkInvite = () => {
    if (!selectedCampaignId) return;
    const creatorIds = shortlist.map((s) => s.creator_id);
    onBulkInvite(selectedCampaignId, creatorIds);
  };

  const count = shortlist.length;

  return (
    <>
      {/* Peek bar (mobile only) — shows when drawer is closed and there are items.
          Mobile bottom offset clears the fixed MobileBottomNav — same 6rem+safe-area
          clearance as StickyApplyCTA (the app's pb-24 nav-clearance convention), so the
          bar sits fully above the nav bar + floating Donny emblem. Desktop has no bottom nav. */}
      {count > 0 && !isOpen && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-4 left-2 right-2 md:left-auto md:right-4 md:w-80 z-40">
          <button
            onClick={() => onOpenChange(true)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white border border-dc-teal rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
          >
            <div className="flex items-center gap-2">
              {/* Avatar stack */}
              <div className="flex -space-x-2">
                {resolvedCreators.slice(0, 3).map((rc) => (
                  <div
                    key={rc.creator.id}
                    className="w-8 h-8 rounded-full border-2 border-white bg-teal-100 flex items-center justify-center overflow-hidden"
                  >
                    <ShortlistAvatar url={rc.avatarUrl} name={rc.creator.creator_name} size="sm" />
                  </div>
                ))}
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {count} creator{count !== 1 ? 's' : ''} saved
              </span>
            </div>
            <ChevronUp className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      )}

      {/* Full drawer */}
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto md:max-w-md md:ml-auto">
          <SheetHeader>
            <SheetTitle className="text-left">
              Shortlist ({count})
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {resolvedCreators.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                Save creators to build your shortlist.
              </p>
            ) : (
              <>
                {/* Creator list */}
                {resolvedCreators.map((rc) => (
                  <div
                    key={rc.creator.id}
                    className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-dc-teal/5"
                  >
                    <ShortlistAvatar url={rc.avatarUrl} name={rc.creator.creator_name} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {rc.creator.creator_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {(rc.creator.skills ?? []).slice(0, 2).map(formatSkillLabel).join(', ')}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemove(rc.creator.user_id)}
                      className="p-1.5 rounded-full hover:bg-dc-teal/5 transition-colors flex-shrink-0"
                    >
                      <X className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                ))}

                {/* Campaign selector (if not already selected at page level) */}
                {!selectedCampaignId && campaigns.length > 0 && (
                  <div className="pt-2 border-t border-dc-teal/15">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Choose a campaign to invite to
                    </label>
                    <select
                      onChange={(e) => onSelectCampaign(e.target.value || null)}
                      value={selectedCampaignId ?? ''}
                      className="w-full px-3 py-2 bg-white border border-dc-teal/20 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-dc-teal"
                    >
                      <option value="">Select campaign...</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Bulk invite button */}
                <button
                  onClick={handleBulkInvite}
                  disabled={!selectedCampaignId || isBulkInviting || count === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-dc-teal-btn text-white rounded-full font-semibold text-sm hover:bg-dc-teal-btn-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                  {isBulkInviting
                    ? 'Sending invitations…'
                    : selectedCampaignId
                      ? `Invite all ${count} to campaign`
                      : 'Select a campaign first'}
                </button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
