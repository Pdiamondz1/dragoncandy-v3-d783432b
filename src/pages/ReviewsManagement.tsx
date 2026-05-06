
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReviewsList } from '@/components/reviews/ReviewsList';
import { RatingStats } from '@/components/reviews/RatingStats';
import { ReviewsErrorBoundary } from '@/components/reviews/ReviewsErrorBoundary';
import { Search, Download } from 'lucide-react';

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
      <ReviewsErrorBoundary>
      <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
        {/* Template B header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Reviews & Ratings</h1>
          </div>
          <Button variant="ghost" size="sm" className="text-dc-pink-accent">
            <Download className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Rating Overview */}
          <div className="border-2 border-dc-teal rounded-2xl p-4">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Your Rating</p>
            <RatingStats revieweeId={user.id} reviewType={receivedReviewType} />
          </div>

          {/* Search and Filter */}
          <div className="border-2 border-dc-teal rounded-2xl p-4">
            <div className="flex gap-3 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search reviews…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 rounded-full h-10 border-gray-200"
                />
              </div>
              <Select value={filterType} onValueChange={(value) => setFilterType(value as 'all' | 'received' | 'given')}>
                <SelectTrigger className="w-36 rounded-full h-10 border-gray-200">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reviews</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="given">Given</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reviews Tabs */}
          <Tabs value={filterType} onValueChange={(value) => setFilterType(value as 'all' | 'received' | 'given')}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="received" className="text-xs">Received</TabsTrigger>
              <TabsTrigger value="given" className="text-xs">Given</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4 mt-4">
              <div className="border-2 border-dc-teal rounded-2xl p-4">
                <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Reviews Received</p>
                <ReviewsList
                  revieweeId={user.id}
                  reviewType={receivedReviewType}
                  limit={5}
                />
              </div>
              <div className="border-2 border-dc-teal rounded-2xl p-4">
                <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Reviews Given</p>
                <ReviewsList
                  revieweeId={user.id}
                  reviewType={givenReviewType}
                  limit={5}
                />
              </div>
            </TabsContent>

            <TabsContent value="received" className="mt-4">
              <div className="border-2 border-dc-teal rounded-2xl p-4">
                <ReviewsList
                  revieweeId={user.id}
                  reviewType={receivedReviewType}
                />
              </div>
            </TabsContent>

            <TabsContent value="given" className="mt-4">
              <div className="border-2 border-dc-teal rounded-2xl p-4">
                <ReviewsList
                  revieweeId={user.id}
                  reviewType={givenReviewType}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      </ReviewsErrorBoundary>
    </DashboardLayout>
  );
};

export default ReviewsManagement;
