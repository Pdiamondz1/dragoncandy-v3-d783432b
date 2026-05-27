import { useState } from 'react';
import { useResolvedAvatarUrl, useSignedUrl } from '@/hooks/useSignedUrl';
import { safeUrl } from '@/lib/safeUrl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Flag } from 'lucide-react';
import { BoostConfirmationSheet } from './BoostConfirmationSheet';
import { AmplificationPreview } from './AmplificationPreview';
import { BOOST_TIERS } from '@/types/dragonshare';
import { useFlagDragonSharePost } from '@/hooks/useFlagDragonSharePost';
import type { DragonSharePostWithRelations, BoostTierLabel } from '@/types/dragonshare';

interface Props {
  post: DragonSharePostWithRelations;
  canBoost: boolean;
}

export function DragonSharePostCard({ post, canBoost }: Props) {
  const [selectedTier, setSelectedTier] = useState<{ cents: number; label: BoostTierLabel } | null>(null);
  const isAlreadyBoosted = post.boost_status === 'boosted';
  const resolvedCreatorAvatar = useResolvedAvatarUrl(post.creator?.avatar_url);
  const contentImageUrl = useSignedUrl('dragonshare-content', post.content_file_path);
  const flagMutation = useFlagDragonSharePost();

  const postUrl = safeUrl(post.post_url);

  return (
    <>
      <div className="rounded-2xl border bg-dc-card overflow-hidden">
        {/* Header: creator info */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {resolvedCreatorAvatar ? (
              <img src={resolvedCreatorAvatar} alt="Creator avatar" className="h-10 w-10 rounded-full ring-2 ring-teal-400" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center text-sm font-bold text-teal-600">
                {post.creator?.full_name?.charAt(0) ?? '?'}
              </div>
            )}
            <div>
              <p className="font-medium text-dc-text">{post.creator?.full_name ?? 'Unknown Creator'}</p>
              <p className="text-xs text-dc-text-muted capitalize">{post.platform} · {post.content_type}</p>
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

        {/* Content image preview */}
        {contentImageUrl && (
          <div className="px-4 pb-3">
            <img
              src={contentImageUrl}
              alt="Content preview"
              className="w-full rounded-xl object-cover max-h-48"
            />
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
            <Badge className="bg-teal-100 text-teal-700 border-teal-200">
              Boosted · ${((post.boosts?.[0]?.amount_cents ?? 0) / 100).toFixed(0)}
            </Badge>
          ) : canBoost ? (
            <div className="flex items-center gap-1.5">
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
            <span className="text-xs">Report</span>
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
    </>
  );
}
