
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Users, RefreshCw, AlertCircle } from 'lucide-react';
import { useCampaignMatches, useGenerateMatches } from '@/hooks/useCampaignMatches';
import CreatorMatchCard from './CreatorMatchCard';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface CreatorMatchingSectionProps {
  campaignId: string;
}

const CreatorMatchingSection: React.FC<CreatorMatchingSectionProps> = ({ campaignId }) => {
  const { data: matches = [], isLoading: matchesLoading, refetch: refetchMatches } = useCampaignMatches(campaignId);
  const generateMatches = useGenerateMatches();
  const [activeTab, setActiveTab] = useState('ai-matches');

  // Fetch all available creators as fallback
  const { data: availableCreators = [], isLoading: creatorsLoading, isError: creatorsError } = useQuery({
    queryKey: ['available-creators'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('id, user_id, creator_name, avatar_url, bio, skills, location, base_rate_per_hour, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url')
        .eq('is_completed', true);

      if (error) throw error;
      return data || [];
    },
  });

  const handleGenerateMatches = async () => {
    try {
      await generateMatches.mutateAsync(campaignId);
      await refetchMatches();
    } catch (error) {
      console.error('Failed to generate matches:', error);
    }
  };

  const isLoading = matchesLoading || generateMatches.isPending;
  const hasMatches = matches.length > 0;
  const hasAvailableCreators = availableCreators.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI-Powered Creator Matching
          </CardTitle>
          <p className="text-sm text-gray-600">
            Find the perfect creators for your campaign using our AI matching algorithm
          </p>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleGenerateMatches}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Analyzing Creators...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Find Perfect Creators
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ai-matches" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Matches ({matches.length})
          </TabsTrigger>
          <TabsTrigger value="all-creators" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Available Creators ({availableCreators.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-matches" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-gray-500">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Generating AI matches...
                </div>
              </CardContent>
            </Card>
          ) : hasMatches ? (
            <div className="grid gap-4">
              {matches.map((match) => (
                <CreatorMatchCard key={match.id} match={match} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No AI matches found
                </h3>
                <p className="text-gray-600 text-center max-w-md mb-4">
                  Our AI couldn't find any perfect matches for your campaign. Try generating matches again or check out all available creators.
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleGenerateMatches} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                  <Button onClick={() => setActiveTab('all-creators')}>
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
                <div className="flex items-center gap-2 text-gray-500">
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
              {availableCreators.map((creator) => (
                <Card key={creator.id} className="border border-gray-200">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        {creator.avatar_url ? (
                          <img 
                            src={creator.avatar_url} 
                            alt={creator.creator_name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                            <Users className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-lg">{creator.creator_name}</h3>
                          <p className="text-gray-600 text-sm">{creator.location || 'Location not specified'}</p>
                          {creator.bio && (
                            <p className="text-gray-700 mt-2 text-sm">{creator.bio}</p>
                          )}
                          {creator.skills && creator.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {creator.skills.slice(0, 3).map((skill, index) => (
                                <span 
                                  key={index}
                                  className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                                >
                                  {skill}
                                </span>
                              ))}
                              {creator.skills.length > 3 && (
                                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                  +{creator.skills.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                          {creator.base_rate_per_hour && (
                            <p className="text-sm text-gray-600 mt-1">
                              Rate: ${creator.base_rate_per_hour}/hour
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Available
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No creators available
                </h3>
                <p className="text-gray-600 text-center max-w-md">
                  There are currently no completed creator profiles available on the platform.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CreatorMatchingSection;
