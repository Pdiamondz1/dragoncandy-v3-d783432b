
import React from 'react';

interface CreatorBrowseHeaderProps {
  resultCount: number;
}

export const CreatorBrowseHeader: React.FC<CreatorBrowseHeaderProps> = ({ resultCount }) => {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-extrabold uppercase tracking-wide text-gray-900">Browse Creators</h1>
      <p className="text-sm text-gray-500 text-center mt-1">{resultCount} creators available</p>
    </div>
  );
};
