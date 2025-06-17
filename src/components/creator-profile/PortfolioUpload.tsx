
import React from 'react';
import { Label } from '@/components/ui/label';
import EnhancedFileUpload from '@/components/files/EnhancedFileUpload';

interface PortfolioUploadProps {
  portfolioFiles: File[];
  onPortfolioFilesChange: (files: File[]) => void;
}

export const PortfolioUpload = ({ portfolioFiles, onPortfolioFilesChange }: PortfolioUploadProps) => {
  return (
    <div>
      <Label>Portfolio</Label>
      <EnhancedFileUpload
        bucketName="profile-media"
        category="portfolio"
        maxFiles={20}
        acceptedTypes={['image/*', 'video/*']}
        onUploadComplete={(files) => {
          // Convert to File objects for backward compatibility
          const fileObjects = files.map(f => new File([], f.original_filename));
          onPortfolioFilesChange(fileObjects);
        }}
        className="mt-2"
      />
    </div>
  );
};
