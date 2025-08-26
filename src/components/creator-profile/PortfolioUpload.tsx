
import React from 'react';
import { Label } from '@/components/ui/label';
import EnhancedFileUpload from '@/components/files/EnhancedFileUpload';
import { CurrentPortfolioDisplay } from './CurrentPortfolioDisplay';

interface PortfolioUploadProps {
  portfolioPaths: string[];
  onPortfolioPathsChange: (paths: string[]) => void;
}

export const PortfolioUpload = ({ portfolioPaths, onPortfolioPathsChange }: PortfolioUploadProps) => {
  const handleRemoveItem = (pathToRemove: string) => {
    const updatedPaths = portfolioPaths.filter(path => path !== pathToRemove);
    onPortfolioPathsChange(updatedPaths);
  };

  return (
    <div>
      <Label>Portfolio</Label>
      
      {/* Display current portfolio items */}
      <div className="mt-2">
        <CurrentPortfolioDisplay 
          portfolioPaths={portfolioPaths}
          onRemoveItem={handleRemoveItem}
        />
      </div>
      
      {/* Upload new items */}
      <div className="mt-4">
        <Label className="text-sm text-muted-foreground">Add New Items</Label>
        <EnhancedFileUpload
          bucketName="profile-assets"
          category="portfolio"
          maxFiles={20}
          acceptedTypes={['image/*', 'video/*']}
          onUploadComplete={(files) => {
            // Extract storage paths from uploaded files (prefer file_path from DB record)
            const newPaths = files
              .map((f: any) => f.file_path || f.path || f.name)
              .filter(Boolean);
            const allPaths = [...portfolioPaths, ...newPaths];
            onPortfolioPathsChange(allPaths);
          }}
          className="mt-2"
        />
      </div>
    </div>
  );
};
