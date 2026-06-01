import { useState } from 'react';
import { useResolvedAvatarUrl } from '@/hooks/useSignedUrl';
import { safeUrl } from '@/lib/safeUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { validateCustomBoost } from '@/lib/boostAmount';
import { ExternalLink, Flag, Download, Share2 } from 'lucide-react';
import { downloadBlob } from '@/lib/downloadUtils';
import { BoostConfirmationSheet } from './BoostConfirmationSheet';
import { DragonShareSharePanel } from './DragonShareSharePanel';
import { AmplificationPreview } from './AmplificationPreview';
import { WatermarkedMedia } from './WatermarkedMedia';
import { BOOST_TIERS, isVideoPost } from '@/types/dragonshare';
import { useFlagDragonSharePost } from '@/hooks/useFlagDragonSharePost';
import { useDeclineDragonSharePost } from '@/hooks/useDeclineDragonSharePost';
import type { DragonSharePostWithRelations, BoostTierLabel } from '@/types/dragonshare';

interface Props {
  post: DragonSharePostWithRelations;
  canBoost: boolean;
}

export function DragonSharePostCard({ post, canBoost }: Props) {
  const [selectedTier, setSelectedTier] = useState<{ cents: number; label: BoostTierLabel } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const isAlreadyBoosted = post.boost_status === 'boosted';
  const resolvedCreatorAvatar = useResolvedAvatarUrl(post.creator?.avatar_url);
  const contentUrl = post.content_file_path;
  const downloadUrl = contentUrl
    ? `${contentUrl}${contentUrl.includes('?') ? '&' : '?'}download`
    : null;
  const downloadName = contentUrl?.split('/').pop()?.split('?')[0] || 'dragonshare-content';
  const flagMutation = useFlagDragonSharePost();
  const declineMutation = useDeclineDragonSharePost();

  const postUrl = safeUrl(post.post_url);

  return (
    <>
      <div className="rounded-2xl border bg-dc-card overflow-hidden">
        {/* Header: creator info */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {resolvedCreatorAvatar && !avatarError ? (
              <img src={resolvedCreatorAvatar} alt="Creator avatar" className="h-10 w-10 rounded-full ring-2 ring-teal-400" onError={() => setAvatarError(true)} />
            ) : (
              <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center text-sm font-bold text-teal-600">
                {post.creator?.full_name?.charAt(0) ?? '?'}
              </div>
            )}
            <div>
              <p className="font-medium text-dc-text">{post.creator?.full_name ?? 'Unknown Creator'}</p>
              <p className="text-xs text-dc-text-muted capitalize">{post.platform ?? 'direct upload'} · {post.content_type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {postUrl && (
              <a href={postUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 text-dc-text-muted hover:text-dc-text" />
              </a>
            )}
            <span className="text-xs text-dc-text-muted">
              {new Date(post.submitted_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Caption */}
        {post.caption && (
          <div className="px-4 pb-3">
            <p className="text-sm text-dc-text-muted line-clamp-3">{post.caption}</p>
          </div>
        )}

        {/* Content preview */}
        {contentUrl && (
          <div className="px-4 pb-3">
            <WatermarkedMedia src={contentUrl} isVideo={isVideoPost(post)} watermark={!isAlreadyBoosted} />
          </div>
        )}

        {/* Amplification Preview */}
        {!isAlreadyBoosted && (
          <div className="px-4 pb-3">
            <AmplificationPreview
              creatorId={post.creator_id}
              orgId={post.target_org_id}
              creatorName={post.creator?.full_name}
              orgName={post.target_org?.name}
            />
          </div>
        )}

        {/* Boost tiers / status */}
        <div className="px-4 pb-3">
          {isAlreadyBoosted ? (
            <div className="flex items-center justify-between gap-2">
              <Badge className="bg-teal-100 text-teal-700 border-teal-200">
                Boosted · ${((post.boosts?.[0]?.amount_cents ?? 0) / 100).toFixed(0)}
              </Badge>
              <div className="flex items-center gap-2">
                {downloadUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full gap-1"
                    onClick={() => downloadBlob(downloadUrl, downloadName)}
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                )}
                <Button
                  size="sm"
                  className="rounded-full gap-1 bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white"
                  onClick={() => setShareOpen(true)}
                >
                  <Share2 className="h-3.5 w-3.5" /> Share
                </Button>
              </div>
            </div>
          ) : canBoost ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 lg:gap-2">
                {BOOST_TIERS.map((tier) => {
                  const isPopular = tier.label === '50';
                  return (
                    <div key={tier.label} className="flex-1 flex flex-col items-center gap-0.5">
                      {isPopular ? (
                        <span className="text-[10px] font-bold text-dc-teal uppercase tracking-wide">POPULAR</span>
                      ) : (
                        <span className="text-[10px] invisible">POPULAR</span>
                      )}
                      <Button
                        variant={isPopular ? 'default' : 'outline'}
                        size="sm"
                        className={`rounded-full w-full ${isPopular ? 'bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white' : ''}`}
                        onClick={() => setSelectedTier({ cents: tier.cents, label: tier.label })}
                      >
                        {tier.display}
                      </Button>
                    </div>
                  );
                })}
                <div className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[10px] invisible">POPULAR</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full w-full"
                    onClick={() => { setCustomOpen((o) => !o); setCustomError(null); }}
                  >
                    Custom
                  </Button>
                </div>
              </div>
              {customOpen && (
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dc-text-muted">$</span>
                      <Input
                        type="number" min={5} max={500} inputMode="decimal"
                        aria-label="Custom boost amount in dollars"
                        placeholder="5–500"
                        value={customVal}
                        onChange={(e) => { setCustomVal(e.target.value); setCustomError(null); }}
                        className="rounded-full pl-6"
                      />
                    </div>
                    {customError && <p className="text-[11px] text-dc-pink-accent mt-1">{customError}</p>}
                  </div>
                  <Button
                    size="sm"
                    className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white"
                    onClick={() => {
                      const v = validateCustomBoost(parseFloat(customVal));
                      if (v.ok) { setSelectedTier({ cents: v.cents, label: 'custom' }); setCustomOpen(false); }
                      else setCustomError(v.reason);
                    }}
                  >
                    Boost
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full rounded-full text-dc-text-muted hover:text-dc-text mt-1"
                disabled={declineMutation.isPending || selectedTier !== null}
                onClick={() => declineMutation.mutate(post.id)}
              >
                Pass — not a fit right now
              </Button>
            </div>
          ) : (
            <p className="text-xs text-dc-text-muted">Ask an admin to boost this.</p>
          )}
        </div>

        {/* Footer: Report button */}
        <div className="px-4 pb-4 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-dc-text-muted hover:text-dc-pink-accent h-7 px-2 gap-1"
            onClick={() => flagMutation.mutate(post.id)}
            disabled={flagMutation.isPending || post.flagged_at !== null}
          >
            <Flag className="h-3 w-3" />
            <span className="text-[10px]">Report</span>
          </Button>
        </div>
      </div>

      {selectedTier && (
        <BoostConfirmationSheet
          open={!!selectedTier}
          onOpenChange={(open) => { if (!open) setSelectedTier(null); }}
          post={post}
          amountCents={selectedTier.cents}
          tierLabel={selectedTier.label}
          creatorId={post.creator_id}
          orgId={post.target_org_id}
        />
      )}

      <DragonShareSharePanel
        open={shareOpen}
        onOpenChange={setShareOpen}
        post={post}
        creatorName={post.creator?.full_name}
      />
    </>
  );
}
