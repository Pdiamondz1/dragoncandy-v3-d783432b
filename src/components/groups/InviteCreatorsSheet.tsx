import React, { useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCreatorBrowse } from '@/hooks/useCreatorBrowse';
import { useBrandShortlist } from '@/hooks/useBrandShortlist';
import { resolveProfileAssetUrl } from '@/hooks/useSignedUrl';
import { formatSkillLabel } from '@/lib/skillUtils';
import type { CreatorGroupMember } from '@/hooks/useCreatorGroupMembers';
import { Check, Search, Send, Loader2 } from 'lucide-react';

interface InviteCreatorsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing members — creators already `active` or `invited` are excluded from the picker. */
  currentMembers: CreatorGroupMember[];
  /** Wire to the invite mutation's `mutateAsync`. Resolves on success → sheet clears + closes. */
  onInvite: (creatorIds: string[]) => Promise<unknown>;
  isInviting: boolean;
}

function initialsFor(name: string): string {
  return (
    name
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}

const CandidateAvatar: React.FC<{ url?: string; name: string }> = ({ url, name }) => {
  const [failed, setFailed] = useState(false);
  const resolved = resolveProfileAssetUrl(url);

  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-teal-400"
      />
    );
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-dc-teal to-dc-teal-dark ring-2 ring-teal-400">
      <span className="text-sm font-bold text-white">{initialsFor(name)}</span>
    </div>
  );
};

export const InviteCreatorsSheet: React.FC<InviteCreatorsSheetProps> = ({
  open,
  onOpenChange,
  currentMembers,
  onInvite,
  isInviting,
}) => {
  // Brand mode: location control available but no radius auto-hide, so every creator is searchable.
  const { filteredCreators, filters, handleFilterChange, isLoading, error } =
    useCreatorBrowse('brand');
  const { shortlist } = useBrandShortlist();

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const excludedIds = useMemo(
    () =>
      new Set(
        currentMembers
          .filter((m) => m.status === 'active' || m.status === 'invited')
          .map((m) => m.creator_id),
      ),
    [currentMembers],
  );

  const shortlistIds = useMemo(
    () => new Set(shortlist.map((s) => s.creator_id)),
    [shortlist],
  );

  // Candidates = searchable creators not already in this crew; shortlisted creators surface first.
  const candidates = useMemo(() => {
    const list = filteredCreators.filter((c) => !excludedIds.has(c.user_id));
    return [...list].sort((a, b) => {
      const aRank = shortlistIds.has(a.user_id) ? 0 : 1;
      const bRank = shortlistIds.has(b.user_id) ? 0 : 1;
      return aRank - bRank;
    });
  }, [filteredCreators, excludedIds, shortlistIds]);

  const selectedList = useMemo(
    () => candidates.filter((c) => selected.has(c.user_id)),
    [candidates, selected],
  );

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setSelected(new Set());
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0 || isInviting) return;
    try {
      await onInvite(ids);
      setSelected(new Set());
      onOpenChange(false);
    } catch {
      // Error toast is handled by the invite mutation; keep the sheet open.
    }
  };

  const count = selected.size;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[82dvh] flex-col rounded-t-2xl p-0 md:ml-auto md:max-w-md"
      >
        <SheetHeader className="border-b border-dc-teal/15 px-5 pb-4 pt-5">
          <SheetTitle className="text-left text-dc-text">Invite creators</SheetTitle>
          <SheetDescription className="text-left">
            Search and tap creators to add them to this crew.
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 pt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dc-text-muted" />
            <Input
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
              placeholder="Search creators by name, skill, or place…"
              className="rounded-full pl-9"
            />
          </div>
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto px-5 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-dc-teal">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-dc-text-muted">
              Couldn't load creators. Please try again.
            </p>
          ) : candidates.length === 0 ? (
            <p className="py-10 text-center text-sm text-dc-text-muted">
              {filters.searchTerm.trim()
                ? 'No creators match your search.'
                : 'No creators available to invite.'}
            </p>
          ) : (
            candidates.map((creator) => {
              const isSelected = selected.has(creator.user_id);
              const isSaved = shortlistIds.has(creator.user_id);
              return (
                <button
                  key={creator.id}
                  type="button"
                  onClick={() => toggle(creator.user_id)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                    isSelected
                      ? 'border-dc-teal bg-dc-teal/10'
                      : 'border-dc-teal/25 bg-dc-card hover:border-dc-teal/60'
                  }`}
                >
                  <CandidateAvatar url={creator.avatar_url} name={creator.creator_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-dc-text">
                        {creator.creator_name}
                      </p>
                      {isSaved && (
                        <span className="shrink-0 rounded-full bg-dc-pink/30 px-2 py-0.5 text-[10px] font-semibold text-dc-pink-accent">
                          Saved
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-dc-text-muted">
                      {(creator.skills ?? []).slice(0, 3).map(formatSkillLabel).join(', ') ||
                        'Creator'}
                    </p>
                  </div>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isSelected
                        ? 'border-dc-teal bg-dc-teal text-white'
                        : 'border-dc-teal/40 text-transparent'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Sticky confirm footer with a selected-avatar peek stack.
            pb includes the safe-area inset so the confirm button clears the iOS
            home indicator / Safari toolbar zone (env() is 0 on desktop). */}
        <div className="border-t border-dc-teal/15 bg-dc-card px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {selectedList.slice(0, 4).map((c) => {
                const url = resolveProfileAssetUrl(c.avatar_url);
                return (
                  <div
                    key={c.id}
                    className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-dc-teal/15"
                  >
                    {url ? (
                      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-[10px] font-bold text-dc-teal">
                        {initialsFor(c.creator_name)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <span className="flex-1 text-sm font-semibold text-dc-text">
              {count === 0
                ? 'Select creators to invite'
                : `${count} selected`}
            </span>
            <Button
              variant="dc-primary"
              size="sm"
              onClick={handleConfirm}
              disabled={count === 0 || isInviting}
              isLoading={isInviting}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
              {count > 0 ? `Invite ${count}` : 'Invite'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
