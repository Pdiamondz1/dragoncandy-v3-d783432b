import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { DragonFeedGrid } from '@/components/dragon-feed/DragonFeedGrid';

const CreatorDragonFeed: React.FC = () => {
  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Dragon Feed</h1>
            <p className="text-muted-foreground">
              View your portfolio content and see how it's performing in the Dragon Feed
            </p>
          </div>
          <DragonFeedGrid />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorDragonFeed;
