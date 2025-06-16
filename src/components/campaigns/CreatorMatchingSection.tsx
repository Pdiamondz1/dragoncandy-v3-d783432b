
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Sparkles, RefreshCw, Users } from 'lucide-react';
import { useCampaignMatches, useGenerateMatches } from '@/hooks/useCampaignMatches';
import { useCampaignInvitations } from '@/hooks/useCampaignInvitations';
import CreatorMatchCard from './CreatorMatchCard';
import { Skeleton } from '@/components/ui/skeleton';

interface CreatorMatchingSectionProps {
  campaignId: string;
}

const CreatorMatchingSection: React.FC<CreatorMatchingSectionProps> = ({ campaignId }) => {
  const { data: matches, isLoading: matchesLoading } = useCampaignMatches(campaignId);
  const { data: invitations } = useCampaignInvitations(campaignId);
  const generateMatches = useGenerateMatches();

  const invitedCreatorIds = new Set(invitations?.map(inv => inv.creator_id) || []);

  const handleGenerateMatches = () => {
    generateMatches.mutate(campaignId);
  };

  const hasMatches = matches && matches.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-500" />
            AI Creator Matching
          </CardTitle>
          <p className="text-sm text-gray-600">
            Our AI analyzes your campaign requirements and finds the best creators for your project
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button 
              onClick={handleGenerateMatches}
              disabled={generateMatches.isPending}
              className="flex items-center gap-2"
            >
              {generateMatches.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {hasMatches ? 'Generate New Matches' : 'Find Perfect Creators'}
            </Button>
            
            {hasMatches && (
              <Button variant="outline" onClick={handleGenerateMatches} disabled={generateMatches.isPending}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Matches
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {matchesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="h-[400px]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : hasMatches ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5" />
            Top Creator Matches ({matches.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {matches.map((match) => (
              <CreatorMatchCard
                key={match.id}
                match={match}
                isInvited={invitedCreatorIds.has(match.creator_id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No matches found yet
            </h3>
            <p className="text-gray-600 text-center mb-4">
              Click "Find Perfect Creators" to discover amazing creators for your campaign
            </p>
            <Button onClick={handleGenerateMatches} disabled={generateMatches.isPending}>
              <Sparkles className="h-4 w-4 mr-2" />
              Find Perfect Creators
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CreatorMatchingSection;
