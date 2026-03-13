
import React from 'react';

interface CreatorBrowseHeaderProps {
  resultCount: number;
}

export const CreatorBrowseHeader: React.FC<CreatorBrowseHeaderProps> = ({ resultCount }) => {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-extrabold text-dc-teal uppercase tracking-wide text-center mb-1">Browse Creators</h1>
      <p className="text-sm text-dc-teal text-center">Ready to create amazing content with talented creators?</p>
    </div>
  );
};
