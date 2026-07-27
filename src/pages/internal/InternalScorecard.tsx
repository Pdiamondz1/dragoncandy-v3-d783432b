import { useState } from 'react';
import { toast } from 'sonner';
import { usePlatformStats } from '@/hooks/internal/usePlatformStats';
import { usePlatformWeight } from '@/hooks/internal/usePlatformWeight';
import { useScorecardBurn } from '@/hooks/internal/useScorecardBurn';
import {
  useScorecardHeadline,
  useScorecardBurnCeilingCents,
  useUpdateScorecardHeadline,
} from '@/hooks/internal/useScorecardSettings';
import { useInternalAccess } from '@/hooks/internal/useInternalAccess';
import { buildScorecard } from '@/lib/internal/scorecardModel';
import { DISK_LIMIT_BYTES } from '@/lib/internal/weightThresholds';
import { aiCapStatus } from '@/lib/aiCostCap';
import { ScorecardStoryCard } from '@/components/internal/ScorecardStoryCard';
import { ScorecardSnapshot } from '@/components/internal/ScorecardSnapshot';
import { ErrorCard } from '@/components/internal/stats';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';

const InternalScorecard = () => {
  const { isAdmin } = useInternalAccess();
  const platform = usePlatformStats();
  const weight = usePlatformWeight();
  const burn = useScorecardBurn();
  const headline = useScorecardHeadline();
  const ceiling = useScorecardBurnCeilingCents();
  const updateHeadline = useUpdateScorecardHeadline();

  const [showSnapshot, setShowSnapshot] = useState(false);
  const [draftHeadline, setDraftHeadline] = useState<string | null>(null);

  if (platform.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (platform.isError || !platform.data) {
    return <ErrorCard message="Platform stats failed to load. Check your internal access and try again." />;
  }

  const p = platform.data;
  const cap = burn.data ? aiCapStatus(burn.data.mtd_ai_spend_usd, burn.data.mtd_revenue_cents / 100) : undefined;
  const aiUnderCap = !cap || cap.status === 'green';

  const stories = buildScorecard({
    realUsers: p.users.total,
    realCreators: p.users.by_role['content_creator'] ?? 0,
    realBusinesses: p.businesses.restaurants + p.businesses.brands,
    realCampaigns: p.campaigns.total,
    realPosts: p.dragonshare.posts_total,
    weightSnapshots: weight.data ?? [],
    diskLimitBytes: DISK_LIMIT_BYTES,
    burn: burn.data ?? null, // null → the model renders an honest "unavailable" efficiency card, not a false $0/green (P2)
    burnCeilingCents: ceiling.data ?? 40000,
    aiUnderCap,
  });

  const asOf = new Date().toLocaleDateString();
  const headlineValue = draftHeadline ?? headline.data ?? '';

  const saveHeadline = async () => {
    const trimmed = headlineValue.trim();
    if (!trimmed) {
      toast.error('Headline cannot be empty.');
      return;
    }
    try {
      await updateHeadline.mutateAsync(trimmed);
      setDraftHeadline(null);
      toast.success('Headline updated.');
    } catch (err) {
      console.error('Failed to update scorecard headline:', err);
      toast.error('Failed to update headline.');
    }
  };

  return (
    <PageContainer size="xl">
      <PageHeader
        title="How DragonCandy is doing"
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={() => setShowSnapshot(true)}
              className="flex items-center gap-1.5 rounded-full border border-dc-teal/40 px-4 py-1.5 text-sm font-semibold text-dc-teal transition-colors hover:bg-dc-teal/10"
            >
              Export snapshot
            </button>
          ) : undefined
        }
      />

      {isAdmin ? (
        <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm lg:flex-row lg:items-center">
          <Input
            value={headlineValue}
            onChange={(e) => setDraftHeadline(e.target.value)}
            placeholder="Founder headline"
            className="lg:flex-1"
          />
          <button
            type="button"
            disabled={updateHeadline.isPending}
            onClick={saveHeadline}
            className="rounded-full bg-dc-teal px-5 py-2 text-sm font-bold text-dc-dark transition-colors hover:bg-dc-teal-dark disabled:opacity-50"
          >
            {updateHeadline.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : (
        <p className="mb-6 text-lg text-white/80">{headline.data}</p>
      )}

      <p className="mb-4 font-mono text-xs text-white/40">as of {asOf} · real users only</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {stories.map((s) => (
          <ScorecardStoryCard key={s.key} story={s} />
        ))}
      </div>

      {showSnapshot && (
        <ScorecardSnapshot
          headline={headline.data ?? ''}
          stories={stories}
          asOf={asOf}
          onClose={() => setShowSnapshot(false)}
        />
      )}
    </PageContainer>
  );
};

export default InternalScorecard;
