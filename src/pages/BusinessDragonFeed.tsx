import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { DragonFeedGrid } from '@/components/dragon-feed/DragonFeedGrid';

const BusinessDragonFeed: React.FC = () => {
  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dragon Feed</h1>
            <p className="text-muted-foreground">
              Discover amazing content from our creator community
            </p>
          </div>
          <DragonFeedGrid />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessDragonFeed;