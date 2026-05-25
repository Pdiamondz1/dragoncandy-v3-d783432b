import { useState } from 'react';
import { useResolvedAvatarUrl } from '@/hooks/useSignedUrl';
import { safeUrl } from '@/lib/safeUrl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ExternalLink, SkipForward } from 'lucide-react';
import { BoostConfirmationSheet } from './BoostConfirmationSheet';
import { BOOST_TIERS } from '@/types/dragonshare';
import { WhyExpander } from '@/components/guidance/WhyExpander';
import type { DragonSharePostWithRelations, BoostTierLabel } from '@/types/dragonshare';

interface Props {
  post: DragonSharePostWithRelations;
  canBoost: boolean;
  onSkip: (postId: string) => void;
}

export function DragonSharePostCard({ post, canBoost, onSkip }: Props) {
  const [selectedTier, setSelectedTier] = useState<{ cents: number; label: BoostTierLabel } | null>(null);
  const isAlreadyBoosted = post.boost_status === 'boosted';
  const resolvedCreatorAvatar = useResolvedAvatarUrl(post.creator?.avatar_url);

  return (
    <>
      <div className="rounded-2xl border bg-card overflow-hidden">
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
              <p className="font-medium">{post.creator?.full_name ?? 'Unknown Creator'}</p>
              <p className="text-xs text-muted-foreground capitalize">{post.platform} · {post.content_type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={safeUrl(post.post_url) ?? '#'} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </a>
            <span className="text-xs text-muted-foreground">
              {new Date(post.submitted_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {post.caption && (
          <div className="px-4 pb-3">
            <p className="text-sm text-muted-foreground line-clamp-3">{post.caption}</p>
          </div>
        )}

        {post.donny_recommended_tier && !isAlreadyBoosted && (
          <div className="mx-4 mb-3 rounded-xl bg-teal-50 border border-teal-200 p-3 space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-500" />
              <span className="text-sm font-medium text-teal-700">
                Donny recommends: ${post.donny_recommended_tier} boost
              </span>
              <WhyExpander expanderKey="donny_score" title="What is Donny's score?" body="Donny estimates reach and engagement potential. Higher scores get higher boost recommendations." />
            </div>
            {post.donny_reach_estimate && (
              <p className="text-xs text-teal-600">
                Estimated reach: {post.donny_reach_estimate.toLocaleString()} views
              </p>
            )}
          </div>
        )}

        <div className="px-4 pb-4">
          {isAlreadyBoosted ? (
            <Badge className="bg-teal-100 text-teal-700 border-teal-200">
              Boosted · ${((post.boosts?.[0]?.amount_cents ?? 0) / 100).toFixed(0)}
            </Badge>
          ) : canBoost ? (
            <div className="flex items-center gap-2">
              {BOOST_TIERS.map((tier) => (
                <Button
                  key={tier.label}
                  variant={tier.cents / 100 === post.donny_recommended_tier ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full flex-1"
                  onClick={() => setSelectedTier({ cents: tier.cents, label: tier.label })}
                >
                  {tier.display}
                  {tier.cents / 100 === post.donny_recommended_tier && (
                    <Sparkles className="ml-1 h-3 w-3" />
                  )}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => onSkip(post.id)}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Ask an admin to boost this.</p>
          )}
        </div>
      </div>

      {selectedTier && (
        <BoostConfirmationSheet
          open={!!selectedTier}
          onOpenChange={(open) => { if (!open) setSelectedTier(null); }}
          post={post}
          amountCents={selectedTier.cents}
          tierLabel={selectedTier.label}
        />
      )}
    </>
  );
}
