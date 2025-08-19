
import React from 'react';
import { Label } from '@/components/ui/label';
import EnhancedFileUpload from '@/components/files/EnhancedFileUpload';

interface PortfolioUploadProps {
  portfolioPaths: string[];
  onPortfolioPathsChange: (paths: string[]) => void;
}

export const PortfolioUpload = ({ portfolioPaths, onPortfolioPathsChange }: PortfolioUploadProps) => {
  return (
    <div>
      <Label>Portfolio</Label>
      <EnhancedFileUpload
        bucketName="profile-media"
        category="portfolio"
        maxFiles={20}
        acceptedTypes={['image/*', 'video/*']}
        onUploadComplete={(files) => {
          // Extract storage paths from uploaded files
          const newPaths = files.map(f => f.path || f.name);
          const allPaths = [...portfolioPaths, ...newPaths];
          onPortfolioPathsChange(allPaths);
        }}
        className="mt-2"
      />
      {portfolioPaths.length > 0 && (
        <div className="mt-2 text-sm text-muted-foreground">
          {portfolioPaths.length} portfolio item(s) uploaded
        </div>
      )}
    </div>
  );
};
