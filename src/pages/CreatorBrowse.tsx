
import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Search, 
  MapPin, 
  Star, 
  DollarSign, 
  User, 
  MessageSquare,
  ExternalLink,
  Users
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdvancedCreatorFilters from '@/components/creator-search/AdvancedCreatorFilters';

interface CreatorProfile {
  id: string;
  user_id: string;
  creator_name: string;
  avatar_url?: string;
  bio?: string;
  skills?: string[];
  portfolio_urls?: string[];
  location?: string;
  availability?: string;
  base_rate_per_hour?: number;
  instagram_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  facebook_url?: string;
  linkedin_url?: string;
  x_url?: string;
  other_social_url?: string;
  website_url?: string;
}

interface CreatorFilters {
  searchTerm: string;
  skills: string[];
  location: string;
  minRate: number;
  maxRate: number;
  platforms: string[];
  availability: string;
  experienceLevel: string;
}

const CreatorBrowse: React.FC = () => {
  const { user } = useAuth();
  const [filters, setFilters] = React.useState<CreatorFilters>({
    searchTerm: '',
    skills: [],
    location: '',
    minRate: 0,
    maxRate: 500,
    platforms: [],
    availability: '',
    experienceLevel: '',
  });

  const { data: creators = [], isLoading, error } = useQuery({
    queryKey: ['available-creators'],
    queryFn: async () => {
      console.log('Fetching available creators');
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('*')
        .eq('is_completed', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching creators:', error);
        throw error;
      }

      console.log('Fetched creators:', data);
      return data as CreatorProfile[];
    },
    enabled: !!user,
  });

  const handleFilterChange = (key: keyof CreatorFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      searchTerm: '',
      skills: [],
      location: '',
      minRate: 0,
      maxRate: 500,
      platforms: [],
      availability: '',
      experienceLevel: '',
    });
  };

  // Filter creators based on search criteria
  const filteredCreators = creators.filter(creator => {
    const matchesSearch = 
      creator.creator_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      creator.bio?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      creator.skills?.some(skill => skill.toLowerCase().includes(filters.searchTerm.toLowerCase()));

    const matchesSkills = filters.skills.length === 0 || 
      creator.skills?.some(skill => filters.skills.includes(skill));

    const matchesLocation = !filters.location ||
      creator.location?.toLowerCase().includes(filters.location.toLowerCase());

    const matchesRate = (() => {
      const rate = creator.base_rate_per_hour || 0;
      return rate >= filters.minRate && rate <= filters.maxRate;
    })();

    const matchesPlatforms = filters.platforms.length === 0 || (() => {
      const creatorPlatforms = [];
      if (creator.instagram_url) creatorPlatforms.push('Instagram');
      if (creator.tiktok_url) creatorPlatforms.push('TikTok');
      if (creator.youtube_url) creatorPlatforms.push('YouTube');
      if (creator.facebook_url) creatorPlatforms.push('Facebook');
      if (creator.linkedin_url) creatorPlatforms.push('LinkedIn');
      if (creator.x_url) creatorPlatforms.push('X (Twitter)');
      
      return filters.platforms.some(platform => creatorPlatforms.includes(platform));
    })();

    const matchesAvailability = !filters.availability ||
      creator.availability === filters.availability;

    return matchesSearch && matchesSkills && matchesLocation && matchesRate && 
           matchesPlatforms && matchesAvailability;
  });

  const formatRate = (rate?: number) => {
    if (!rate) return 'Rate not specified';
    return `$${rate}/hour`;
  };

  const getSocialPlatforms = (creator: CreatorProfile) => {
    const platforms = [];
    if (creator.instagram_url) platforms.push('Instagram');
    if (creator.tiktok_url) platforms.push('TikTok');
    if (creator.youtube_url) platforms.push('YouTube');
    if (creator.facebook_url) platforms.push('Facebook');
    if (creator.linkedin_url) platforms.push('LinkedIn');
    if (creator.x_url) platforms.push('X');
    return platforms;
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-64 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-red-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Failed to load creators
                </h3>
                <p className="text-gray-600">
                  There was an error loading the creator profiles.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Browse Creators</h1>
              <p className="text-gray-600">Discover talented content creators for your campaigns</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Users className="h-4 w-4" />
              <span>{filteredCreators.length} creators available</span>
            </div>
          </div>

          {/* Advanced Filters */}
          <AdvancedCreatorFilters
            filters={filters}
            onFilterChange={handleFilterChange}
            onResetFilters={resetFilters}
            resultCount={filteredCreators.length}
          />

          {/* Creators Grid */}
          {filteredCreators.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No creators found
                </h3>
                <p className="text-gray-600">
                  Try adjusting your search criteria to find more creators.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCreators.map((creator) => (
                <Card key={creator.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={creator.avatar_url} />
                        <AvatarFallback>
                          <User className="h-6 w-6" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">
                          {creator.creator_name}
                        </CardTitle>
                        {creator.location && (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{creator.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {creator.bio && (
                      <p className="text-sm text-gray-600 line-clamp-3">
                        {creator.bio}
                      </p>
                    )}

                    {creator.skills && creator.skills.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 text-sm">Skills</h4>
                        <div className="flex flex-wrap gap-1">
                          {creator.skills.slice(0, 3).map((skill, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                          {creator.skills.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{creator.skills.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {getSocialPlatforms(creator).length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 text-sm">Platforms</h4>
                        <div className="flex flex-wrap gap-1">
                          {getSocialPlatforms(creator).slice(0, 3).map((platform, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {platform}
                            </Badge>
                          ))}
                          {getSocialPlatforms(creator).length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{getSocialPlatforms(creator).length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">
                          {formatRate(creator.base_rate_per_hour)}
                        </span>
                      </div>
                      
                      {creator.availability && (
                        <Badge 
                          variant={creator.availability === 'Available' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {creator.availability}
                        </Badge>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button size="sm" className="flex-1">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Contact
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Profile
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorBrowse;
