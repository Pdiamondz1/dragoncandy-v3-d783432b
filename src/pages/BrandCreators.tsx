import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCreatorBrowse } from '@/hooks/useCreatorBrowse';
import { Users, MapPin, DollarSign, Star, Search, Loader2, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import * as React from 'react';

const BrandCreators = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const { filteredCreators, isLoading, handleFilterChange } = useCreatorBrowse();

  // Update search filter when searchQuery changes
  React.useEffect(() => {
    handleFilterChange('searchTerm', searchQuery);
  }, [searchQuery]);

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout userRole="brand">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Creator Directory</h1>
          <p className="text-muted-foreground">
            Discover and connect with local content creators for brand collaborations
          </p>
        </div>

        <div className="mb-6">
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search creators by name, skills, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredCreators && filteredCreators.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCreators.map((creator) => (
              <Card key={creator.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    {creator.avatar_url ? (
                      <img
                        src={creator.avatar_url}
                        alt={creator.creator_name}
                        className="w-16 h-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-8 w-8 text-primary" />
                      </div>
                    )}
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-1">
                        {creator.creator_name}
                      </CardTitle>
                      {creator.location && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {creator.location}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {creator.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {creator.bio}
                      </p>
                    )}
                    
                    {creator.skills && creator.skills.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {creator.skills.slice(0, 3).map((skill, index) => (
                          <Badge key={index} variant="secondary">
                            {skill}
                          </Badge>
                        ))}
                        {creator.skills.length > 3 && (
                          <Badge variant="outline">+{creator.skills.length - 3}</Badge>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-4 text-sm">
                        {creator.average_rating > 0 && (
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-medium">{creator.average_rating}</span>
                          </div>
                        )}
                        {creator.base_rate_per_hour && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <DollarSign className="h-4 w-4" />
                            <span>${creator.base_rate_per_hour}/hr</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => navigate(`/creator/${creator.profile_slug}`)}
                      >
                        View Profile
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => navigate(`/dashboard/brand/messages`)}
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Contact
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Creators Found</h3>
              <p className="text-muted-foreground text-center max-w-md">
                {searchQuery
                  ? 'Try adjusting your search filters'
                  : 'No creators available at the moment'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default BrandCreators;
