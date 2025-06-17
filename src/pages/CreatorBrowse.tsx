
import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  MapPin, 
  Star, 
  DollarSign, 
  User, 
  MessageSquare,
  ExternalLink,
  Filter,
  Users
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

const CreatorBrowse: React.FC = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [skillFilter, setSkillFilter] = React.useState('');
  const [locationFilter, setLocationFilter] = React.useState('');
  const [rateFilter, setRateFilter] = React.useState('');

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

  // Filter creators based on search criteria
  const filteredCreators = creators.filter(creator => {
    const matchesSearch = 
      creator.creator_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      creator.bio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      creator.skills?.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesSkill = !skillFilter || 
      creator.skills?.some(skill => skill.toLowerCase().includes(skillFilter.toLowerCase()));

    const matchesLocation = !locationFilter ||
      creator.location?.toLowerCase().includes(locationFilter.toLowerCase());

    const matchesRate = !rateFilter || (() => {
      const rate = creator.base_rate_per_hour || 0;
      switch (rateFilter) {
        case 'under-50': return rate < 50;
        case '50-100': return rate >= 50 && rate <= 100;
        case '100-200': return rate >= 100 && rate <= 200;
        case 'over-200': return rate > 200;
        default: return true;
      }
    })();

    return matchesSearch && matchesSkill && matchesLocation && matchesRate;
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

          {/* Search and Filters */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search creators by name, bio, or skills..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Skills</label>
                    <Input
                      placeholder="Filter by skill..."
                      value={skillFilter}
                      onChange={(e) => setSkillFilter(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Location</label>
                    <Input
                      placeholder="Filter by location..."
                      value={locationFilter}
                      onChange={(e) => setLocationFilter(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Rate Range</label>
                    <Select value={rateFilter} onValueChange={setRateFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any rate" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any rate</SelectItem>
                        <SelectItem value="under-50">Under $50/hr</SelectItem>
                        <SelectItem value="50-100">$50-100/hr</SelectItem>
                        <SelectItem value="100-200">$100-200/hr</SelectItem>
                        <SelectItem value="over-200">Over $200/hr</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchTerm('');
                        setSkillFilter('');
                        setLocationFilter('');
                        setRateFilter('');
                      }}
                      className="w-full"
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      Clear Filters
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Creators Grid */}
          {filteredCreators.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No creators found
                </h3>
                <p className="text-gray-600">
                  {searchTerm || skillFilter || locationFilter || rateFilter
                    ? 'Try adjusting your search criteria.'
                    : 'No creators have completed their profiles yet.'
                  }
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
