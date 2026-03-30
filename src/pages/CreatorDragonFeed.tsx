import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { DragonFeedGrid } from '@/components/dragon-feed/DragonFeedGrid';

const CreatorDragonFeed: React.FC = () => {
  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-0 md:max-w-6xl md:mx-auto">
        {/* Template B header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">My Dragon Feed</h1>
          </div>
        </div>
        <div className="p-4">
          <DragonFeedGrid />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorDragonFeed;
