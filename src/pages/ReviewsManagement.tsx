
import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReviewsList from '@/components/reviews/ReviewsList';
import RatingStats from '@/components/reviews/RatingStats';
import { Search, Filter, Download, Star } from 'lucide-react';

const ReviewsManagement = () => {
  const { user, profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'received' | 'given'>('all');

  if (!user || !profile) {
    return null;
  }

  const isCreator = profile.role === 'content_creator';
  const receivedReviewType = isCreator ? 'business_to_creator' : 'creator_to_business';
  const givenReviewType = isCreator ? 'creator_to_business' : 'business_to_creator';

  return (
    <DashboardLayout userRole={profile.role}>
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Reviews & Ratings</h1>
              <p className="text-muted-foreground mt-2">Manage your reviews and track your reputation</p>
            </div>
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export Reviews
            </Button>
          </div>

          {/* Rating Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Your Rating Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RatingStats revieweeId={user.id} reviewType={receivedReviewType} />
            </CardContent>
          </Card>

          {/* Search and Filters */}
          <Card>
            <CardContent className="p-6">
              <div className="flex gap-4 items-center">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search reviews..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter reviews" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Reviews</SelectItem>
                    <SelectItem value="received">Received Reviews</SelectItem>
                    <SelectItem value="given">Given Reviews</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Reviews Tabs */}
          <Tabs value={filterType} onValueChange={(value: any) => setFilterType(value)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">All Reviews</TabsTrigger>
              <TabsTrigger value="received">Reviews Received</TabsTrigger>
              <TabsTrigger value="given">Reviews Given</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Reviews Received</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ReviewsList 
                      revieweeId={user.id} 
                      reviewType={receivedReviewType}
                      limit={5}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Reviews Given</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ReviewsList 
                      revieweeId={user.id} 
                      reviewType={givenReviewType}
                      limit={5}
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="received">
              <Card>
                <CardContent className="p-6">
                  <ReviewsList 
                    revieweeId={user.id} 
                    reviewType={receivedReviewType}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="given">
              <Card>
                <CardContent className="p-6">
                  <ReviewsList 
                    revieweeId={user.id} 
                    reviewType={givenReviewType}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ReviewsManagement;
