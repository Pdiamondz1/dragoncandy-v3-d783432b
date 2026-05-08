import React from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DragonFeedGrid } from '@/components/dragon-feed/DragonFeedGrid';
import { PageHeader } from '@/components/ui/PageHeader';

const BusinessDragonFeed: React.FC = () => {
  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-0 md:max-w-6xl md:mx-auto">
        {/* Template B header */}
        <PageHeader>
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Dragon Feed</h1>
          </div>
        </PageHeader>
        <div className="p-4">
          <DragonFeedGrid />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessDragonFeed;