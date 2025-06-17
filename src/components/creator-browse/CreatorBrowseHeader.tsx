
import React from 'react';
import { Users } from 'lucide-react';

interface CreatorBrowseHeaderProps {
  resultCount: number;
}

export const CreatorBrowseHeader: React.FC<CreatorBrowseHeaderProps> = ({ resultCount }) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Browse Creators</h1>
        <p className="text-gray-600">Discover talented content creators for your campaigns</p>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Users className="h-4 w-4" />
        <span>{resultCount} creators available</span>
      </div>
    </div>
  );
};
