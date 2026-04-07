import React from 'react';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';

export const EmptyStateNoCampaigns: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center mb-4">
        <Megaphone className="h-8 w-8 text-teal-400" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">
        Create a campaign first
      </h3>
      <p className="text-sm text-gray-500 text-center max-w-xs mb-6">
        To invite creators, you need at least one active campaign. Create your first campaign to start discovering and sponsoring creators.
      </p>
      <Link
        to="/dashboard/brand/campaigns/create"
        className="px-8 py-3 bg-teal-400 text-white rounded-full font-semibold text-sm hover:bg-teal-500 transition-colors"
      >
        Create Campaign
      </Link>
    </div>
  );
};
