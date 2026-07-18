
import React, { useState, useMemo } from 'react';
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
import { useInviteCreator, useCampaignInvitations } from '@/hooks/useCampaignInvitations';
import { CreatorMatchCard } from './CreatorMatchCard';
import { ResolvedAvatar } from '@/components/ui/resolved-avatar';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { formatSkillLabel } from '@/lib/skillUtils';

interface CreatorMatchingSectionProps {
  campaignId: string;
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

export const CreatorMatchingSection: React.FC<CreatorMatchingSectionProps> = ({ campaignId }) => {
  const { data: matches = [], isLoading: matchesLoading, refetch: refetchMatches } = useCampaignMatches(campaignId);
  const generateMatches = useGenerateMatches();
  const [activeTab, setActiveTab] = useState('ai-matches');
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  const inviteCreator = useInviteCreator();
  const { data: invitations } = useCampaignInvitations(campaignId);
  const invitedCreatorIds = new Set((invitations || []).map(inv => inv.creator_id));

  const handleInvite = (creatorId: string) => {
    inviteCreator.mutate({ campaignId, creatorId });
  };

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
      await generateMatches.mutateAsync(campaignId);
      await refetchMatches();
    } catch (error) {
      console.error('Failed to generate matches:', error);
    }
  };

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

  const isLoading = matchesLoading || generateMatches.isPending;
  const hasMatches = matches.length > 0;
  const hasAvailableCreators = availableCreators.length > 0;

  return (
    <div className="space-y-6">
      {/* Generate Button Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-dc-teal" />
            AI-Powered Creator Matching
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Our algorithm scores creators across platform fit, budget, skills, location, availability, and content quality
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerateMatches}
            disabled={isLoading}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Analyzing Creators...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {hasMatches ? 'Re-generate Matches' : 'Find Perfect Creators'}
              </>
            )}
          </Button>

          {/* Match summary stats */}
          {matchStats && !isLoading && (
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
          {hasMatches && !isLoading && (
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

          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin text-teal-500" />
                  <div className="text-center">
                    <p className="font-medium">Analyzing creators...</p>
                    <p className="text-xs mt-1">Scoring platform fit, budget, skills, location & content quality</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : hasMatches && filteredMatches.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredMatches.map((match, index) => (
                <div key={match.id} className="relative">
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
                    isInvited={invitedCreatorIds.has(match.creator_id)}
                    onInvite={handleInvite}
                  />
                </div>
              ))}
            </div>
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
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  No AI matches yet
                </h3>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  Click "Find Perfect Creators" above to run our AI matching algorithm across all available creators.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button onClick={handleGenerateMatches} variant="outline" className="w-full sm:w-auto">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Generate Matches
                  </Button>
                  <Button onClick={() => setActiveTab('all-creators')} className="w-full sm:w-auto">
                    <Users className="h-4 w-4 mr-2" />
                    View All Creators
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
                const isInvited = invitedCreatorIds.has(creator.user_id);
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
                          <Button
                            size="sm"
                            className="rounded-full"
                            variant={isInvited ? 'outline' : 'default'}
                            disabled={isInvited || inviteCreator.isPending}
                            onClick={() => handleInvite(creator.user_id)}
                          >
                            {isInvited ? 'Invited' : 'Invite'}
                          </Button>
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
                  Creators will appear here once they sign up. Use AI Matches to automatically find and invite the best fit for your campaign.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

