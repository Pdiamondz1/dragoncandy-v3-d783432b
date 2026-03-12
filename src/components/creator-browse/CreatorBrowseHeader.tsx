
import React from 'react';

interface CreatorBrowseHeaderProps {
  resultCount: number;
}

export const CreatorBrowseHeader: React.FC<CreatorBrowseHeaderProps> = ({ resultCount }) => {
  return (
    <div className="text-center py-6">
      <h1 className="text-2xl font-bold uppercase text-white tracking-wide mb-1">Browse Creators</h1>
      <p className="text-sm text-teal-300">Ready to create amazing content with talented creators?</p>
    </div>
  );
};
