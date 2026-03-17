
import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';

const MarketplaceLoadingState: React.FC = () => {
  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8 bg-[#A8A8A0] min-h-screen overflow-x-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-64 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MarketplaceLoadingState;
