
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  Users,
  RefreshCw,
  AlertCircle,
  ArrowUpDown,
  Filter,
  Trophy,
} from 'lucide-react';
import { useCampaignMatches, useGenerateMatches, CreatorMatch } from '@/hooks/useCampaignMatches';
import {
  useInviteCreator,
  useCampaignInvitations,
  CampaignInvitation,
} from '@/hooks/useCampaignInvitations';
import { CreatorMatchCard } from './CreatorMatchCard';
import { MatchingProgress, MatchCardsSkeleton } from './MatchingProgress';
import {
  INVITE_EXPLAINER,
  INVITE_LABEL,
  INVITE_PENDING_LABEL,
  describeInvitation,
} from './inviteCopy';
import { WhyExpander } from '@/components/guidance/WhyExpander';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { ResolvedAvatar } from '@/components/ui/resolved-avatar';
import { motion, staggerContainer, staggerItem, useReducedMotion } from '@/lib/motion';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { formatSkillLabel } from '@/lib/skillUtils';

interface CreatorMatchingSectionProps {
  campaignId: string;
  /**
   * Gates the automatic run. A draft campaign can't be invited to at all
   * (`send-campaign-invitation` requires published/active), so auto-spending an
   * AI call on one is pure waste.
   */
  campaignStatus?: string | null;
  /** Jump to the applications list on this page. */
  onViewApplications?: () => void;
}

/** Statuses for which matching is worth running on its own. */
const AUTO_MATCH_STATUSES = new Set(['published', 'active']);

/**
 * Marks a campaign as already auto-matched for this tab, so navigating away and
 * back doesn't re-run it. Deliberately session-scoped, NOT persistent: if a
 * campaign still has zero matches in a later session, re-running is the right
 * behaviour — the creator pool grows over time.
 */
const autoMatchKey = (campaignId: string) => `dc:auto-match:${campaignId}`;

function alreadyAutoMatched(campaignId: string): boolean {
  try {
    return sessionStorage.getItem(autoMatchKey(campaignId)) !== null;
  } catch {
    return false; // private mode / storage disabled — the in-mount ref still guards
  }
}

function markAutoMatched(campaignId: string): void {
  try {
    sessionStorage.setItem(autoMatchKey(campaignId), '1');
  } catch {
    /* non-fatal */
  }
}

type SortOption = 'score' | 'platform' | 'budget' | 'skills' | 'geographic' | 'availability' | 'ai_quality';
type FilterOption = 'all' | 'excellent' | 'great' | 'good';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'score', label: 'Overall Score' },
  { value: 'platform', label: 'Platform Fit' },
  { value: 'budget', label: 'Budget Fit' },
  { value: 'skills', label: 'Skills Match' },
  { value: 'geographic', label: 'Location' },
  { value: 'availability', label: 'Availability' },
  { value: 'ai_quality', label: 'Content Quality' },
];

const FILTER_OPTIONS: { value: FilterOption; label: string; min: number }[] = [
  { value: 'all', label: 'All Matches', min: 0 },
  { value: 'excellent', label: '85+ Excellent', min: 85 },
  { value: 'great', label: '70+ Great', min: 70 },
  { value: 'good', label: '55+ Good', min: 55 },
];

function sortMatches(matches: CreatorMatch[], sortBy: SortOption): CreatorMatch[] {
  return [...matches].sort((a, b) => {
    if (sortBy === 'score') return b.match_score - a.match_score;

    const aBreakdown = a.match_reasons.score_breakdown;
    const bBreakdown = b.match_reasons.score_breakdown;

    if (!aBreakdown || !bBreakdown) return b.match_score - a.match_score;

    const key = sortBy as keyof typeof aBreakdown;
    return (bBreakdown[key] ?? 0) - (aBreakdown[key] ?? 0);
  });
}

export const CreatorMatchingSection: React.FC<CreatorMatchingSectionProps> = ({
  campaignId,
  campaignStatus,
  onViewApplications,
}) => {
  const {
    data: matches = [],
    isLoading: matchesLoading,
    isFetched: matchesFetched,
    refetch: refetchMatches,
  } = useCampaignMatches(campaignId);
  const generateMatches = useGenerateMatches();
  const [activeTab, setActiveTab] = useState('ai-matches');
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const reducedMotion = useReducedMotion();

  const inviteCreator = useInviteCreator();
  const { data: invitations } = useCampaignInvitations(campaignId);

  // Keyed by status, not membership: a creator who DECLINED used to look
  // identical to one who accepted, because `status` was fetched and never read.
  const invitationStatusByCreator = useMemo(
    () =>
      new Map<string, CampaignInvitation['status']>(
        (invitations ?? []).map(inv => [inv.creator_id, inv.status]),
      ),
    [invitations],
  );

  const handleInvite = (creatorId: string) => {
    inviteCreator.mutate({ campaignId, creatorId });
  };

  /** Scoped to the creator actually in flight, so one send doesn't freeze every button. */
  const isInvitingCreator = (creatorId: string) =>
    inviteCreator.isPending && inviteCreator.variables?.creatorId === creatorId;

  const [creatorsPage, setCreatorsPage] = useState(0);
  const CREATORS_PER_PAGE = 10;

  // Fetch all available creators — prefer completed, fall back to any with a name
  const { data: availableCreators = [], isLoading: creatorsLoading, isError: creatorsError } = useQuery({
    queryKey: ['available-creators'],
    queryFn: async () => {
      const { data: completed, error: completedError } = await supabase
        .from('creator_profiles')
        .select('id, user_id, creator_name, avatar_url, bio, skills, location, base_rate_per_hour, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url')
        .eq('is_completed', true);

      if (completedError) throw completedError;
      if (completed && completed.length > 0) return completed;

      const { data: fallback, error: fallbackError } = await supabase
        .from('creator_profiles')
        .select('id, user_id, creator_name, avatar_url, bio, skills, location, base_rate_per_hour, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url')
        .not('creator_name', 'is', null)
        .neq('creator_name', '');

      if (fallbackError) throw fallbackError;
      return fallback || [];
    },
    enabled: activeTab === 'all-creators',
  });

  const handleGenerateMatches = async () => {
    try {
      await generateMatches.mutateAsync({ campaignId });
      await refetchMatches();
    } catch (error) {
      console.error('Failed to generate matches:', error);
    }
  };

  /**
   * Run matching on its own the first time a campaign has none.
   *
   * Matching used to require finding and pressing "Find Perfect Creators", so a
   * freshly created campaign landed on an empty panel and read as broken. This
   * fires silently — no toast either way; success shows up as results, and a
   * failure falls through to the empty state, which still has the manual button.
   *
   * Two guards for two different windows: the ref stops a double-fire inside one
   * mount (the effect re-runs as the mutation flips isPending), sessionStorage
   * stops a re-fire when the user navigates away and comes back. The ref holds
   * the campaign id rather than a boolean, so pointing the panel at a different
   * campaign re-arms it without needing a second reset effect.
   */
  const autoRunFor = useRef<string | null>(null);
  useEffect(() => {
    if (autoRunFor.current === campaignId) return;
    if (!matchesFetched || matchesLoading) return;
    if (matches.length > 0) return;
    if (!AUTO_MATCH_STATUSES.has(campaignStatus ?? '')) return;
    if (alreadyAutoMatched(campaignId)) return;

    autoRunFor.current = campaignId;
    markAutoMatched(campaignId);
    generateMatches.mutate({ campaignId, silent: true });
    // `generateMatches` is a stable mutation object; depending on its identity
    // would re-run this effect and defeat the guards above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, campaignStatus, matchesFetched, matchesLoading, matches.length]);

  // Apply sorting and filtering
  const filteredMatches = useMemo(() => {
    const filterMin = FILTER_OPTIONS.find(f => f.value === filterBy)?.min ?? 0;
    const filtered = filterMin > 0
      ? matches.filter(m => m.match_score >= filterMin)
      : matches;
    return sortMatches(filtered, sortBy);
  }, [matches, sortBy, filterBy]);

  // Stats for the match summary
  const matchStats = useMemo(() => {
    if (matches.length === 0) return null;
    const scores = matches.map(m => m.match_score);
    const avg = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
    const top = Math.max(...scores);
    const excellent = scores.filter(s => s >= 85).length;
    const great = scores.filter(s => s >= 70 && s < 85).length;
    return { avg, top, excellent, great, total: matches.length };
  }, [matches]);

  // Kept apart on purpose. These were one flag, so an ordinary page load on a
  // campaign that already HAD matches flashed "Analyzing creators…" and hid the
  // stats and controls — a claim about work that wasn't happening.
  const isGenerating = generateMatches.isPending;
  const isBusy = matchesLoading || isGenerating;
  const hasMatches = matches.length > 0;
  const hasAvailableCreators = availableCreators.length > 0;

  return (
    <div className="space-y-6">
      {/* Generate Button Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-dc-teal" />
            Best creators for this campaign
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Your campaign is already live in the marketplace — every creator can see it and apply.
            These are the strongest fits; inviting one sends them a direct heads-up so it doesn't
            get lost.
          </p>
          <div className="flex flex-wrap items-center pt-1 text-xs text-muted-foreground">
            <span>{INVITE_EXPLAINER.title}</span>
            <WhyExpander
              expanderKey={INVITE_EXPLAINER.key}
              title={INVITE_EXPLAINER.title}
              body={INVITE_EXPLAINER.body}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerateMatches}
            disabled={isBusy}
            isLoading={isGenerating}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white"
          >
            {isGenerating ? (
              'Finding creators…'
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {hasMatches ? 'Refresh matches' : 'Find creators'}
              </>
            )}
          </Button>

          {/* Match summary stats */}
          {matchStats && !isBusy && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-2 rounded-lg bg-dc-teal/[0.04]">
                <div className="text-lg font-bold text-foreground">{matchStats.total}</div>
                <div className="text-xs text-muted-foreground">Matches</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-dc-teal/[0.04]">
                <div className="text-lg font-bold text-teal-600 dark:text-teal-400">{matchStats.avg}</div>
                <div className="text-xs text-muted-foreground">Avg Score</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-dc-teal/[0.04]">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">{matchStats.top}</div>
                <div className="text-xs text-muted-foreground">Top Score</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-dc-teal/[0.04]">
                <div className="text-lg font-bold text-dc-pink-accent">
                  {matchStats.excellent + matchStats.great}
                </div>
                <div className="text-xs text-muted-foreground">Strong Fits</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ai-matches" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Matches ({filteredMatches.length})
          </TabsTrigger>
          <TabsTrigger value="all-creators" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            All Creators ({availableCreators.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-matches" className="space-y-4">
          {/* Sort & Filter controls */}
          {hasMatches && !isBusy && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterBy} onValueChange={(v) => setFilterBy(v as FilterOption)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {filterBy !== 'all' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterBy('all')}
                  className="h-8 text-xs"
                >
                  Clear filter
                </Button>
              )}
            </div>
          )}

          {isGenerating ? (
            <MatchingProgress />
          ) : matchesLoading ? (
            <MatchCardsSkeleton />
          ) : hasMatches && filteredMatches.length > 0 ? (
            <motion.div
              className="grid gap-4 md:grid-cols-2"
              variants={reducedMotion ? undefined : staggerContainer}
              initial={reducedMotion ? false : 'initial'}
              animate="animate"
            >
              {filteredMatches.map((match, index) => (
                <motion.div
                  key={match.id}
                  className="relative"
                  variants={reducedMotion ? undefined : staggerItem}
                >
                  {index === 0 && sortBy === 'score' && filterBy === 'all' && (
                    <div className="absolute -top-2 -left-2 z-10">
                      <Badge className="bg-yellow-500 text-white text-[10px] gap-1">
                        <Trophy className="h-3 w-3" />
                        Best Match
                      </Badge>
                    </div>
                  )}
                  <CreatorMatchCard
                    match={match}
                    invitationStatus={invitationStatusByCreator.get(match.creator_id)}
                    isInviting={isInvitingCreator(match.creator_id)}
                    onInvite={handleInvite}
                    onViewApplications={onViewApplications}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : hasMatches && filteredMatches.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Filter className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-2">
                  No matches meet the "{FILTER_OPTIONS.find(f => f.value === filterBy)?.label}" filter
                </p>
                <Button variant="outline" size="sm" onClick={() => setFilterBy('all')}>
                  Show all matches
                </Button>
              </CardContent>
            </Card>
          ) : (
            /* Not an error — matching has run and found nobody yet. A red
               AlertCircle here read as a failure the owner had caused. */
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-dc-teal/40 mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  No matches yet
                </h3>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  We'll keep looking as creators join. Your campaign is already live in the
                  marketplace, so creators can find it and apply on their own in the meantime.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button onClick={handleGenerateMatches} variant="outline" className="w-full sm:w-auto">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Check again
                  </Button>
                  <Button onClick={() => setActiveTab('all-creators')} className="w-full sm:w-auto">
                    <Users className="h-4 w-4 mr-2" />
                    Browse all creators
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all-creators" className="space-y-4">
          {creatorsLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading available creators...
                </div>
              </CardContent>
            </Card>
          ) : creatorsError ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h3 className="text-lg font-semibold mb-2">Unable to load creators</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  There was a problem fetching creator profiles. Please try refreshing the page.
                </p>
              </CardContent>
            </Card>
          ) : hasAvailableCreators ? (
            <div className="grid gap-4">
              {availableCreators.slice(0, (creatorsPage + 1) * CREATORS_PER_PAGE).map((creator) => {
                const outcome = describeInvitation(invitationStatusByCreator.get(creator.user_id));
                return (
                  <Card key={creator.id} className="border dark:border-border hover:border-teal-300 dark:hover:border-teal-600 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-4 min-w-0">
                          <ResolvedAvatar
                            path={creator.avatar_url}
                            alt={creator.creator_name}
                            fallback={<Users className="h-6 w-6 text-teal-600 dark:text-teal-400" />}
                            className="w-12 h-12 ring-2 ring-teal-400 shrink-0"
                            fallbackClassName="bg-teal-100 dark:bg-teal-900"
                          />
                          <div className="min-w-0">
                            <h3 className="font-semibold text-lg">{creator.creator_name}</h3>
                            <p className="text-muted-foreground text-sm">{creator.location || 'Location not specified'}</p>
                            {creator.bio && (
                              <p className="text-sm mt-2 line-clamp-2">{creator.bio}</p>
                            )}
                            {creator.skills && creator.skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {creator.skills.slice(0, 4).map((skill: string, index: number) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {formatSkillLabel(skill)}
                                  </Badge>
                                ))}
                                {creator.skills.length > 4 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{creator.skills.length - 4} more
                                  </Badge>
                                )}
                              </div>
                            )}
                            {creator.base_rate_per_hour && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Rate: ${creator.base_rate_per_hour}/hour
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {outcome ? (
                            <AppStatusBadge tone={outcome.tone}>{outcome.label}</AppStatusBadge>
                          ) : (
                            <Button
                              size="sm"
                              className="rounded-full"
                              isLoading={isInvitingCreator(creator.user_id)}
                              onClick={() => handleInvite(creator.user_id)}
                            >
                              {isInvitingCreator(creator.user_id)
                                ? INVITE_PENDING_LABEL
                                : INVITE_LABEL}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {availableCreators.length > (creatorsPage + 1) * CREATORS_PER_PAGE && (
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  onClick={() => setCreatorsPage(p => p + 1)}
                >
                  Load More ({availableCreators.length - (creatorsPage + 1) * CREATORS_PER_PAGE} remaining)
                </Button>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  No creators on the platform yet
                </h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Creators will appear here once they sign up. Your campaign is already live in the
                  marketplace, so it's waiting for them when they do.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

