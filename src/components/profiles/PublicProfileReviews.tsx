
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReviewsList from '@/components/reviews/ReviewsList';
import RatingStats from '@/components/reviews/RatingStats';
import { Star, MessageSquare } from 'lucide-react';

interface PublicProfileReviewsProps {
  profileId: string;
  profileType: 'creator' | 'business';
  showStats?: boolean;
}

const PublicProfileReviews: React.FC<PublicProfileReviewsProps> = ({ 
  profileId, 
  profileType,
  showStats = true 
}) => {
  const reviewType = profileType === 'creator' ? 'business_to_creator' : 'creator_to_business';

  return (
    <div className="space-y-6">
      {showStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Ratings Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RatingStats revieweeId={profileId} reviewType={reviewType} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="recent" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="recent">Recent Reviews</TabsTrigger>
              <TabsTrigger value="all">All Reviews</TabsTrigger>
            </TabsList>
            <TabsContent value="recent" className="mt-6">
              <ReviewsList 
                revieweeId={profileId} 
                reviewType={reviewType}
                limit={3}
              />
            </TabsContent>
            <TabsContent value="all" className="mt-6">
              <ReviewsList 
                revieweeId={profileId} 
                reviewType={reviewType}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublicProfileReviews;
