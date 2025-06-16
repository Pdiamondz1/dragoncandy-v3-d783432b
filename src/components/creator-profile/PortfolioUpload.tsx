
import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface PortfolioUploadProps {
  portfolioFiles: File[];
  onPortfolioFilesChange: (files: File[]) => void;
}

export const PortfolioUpload = ({ portfolioFiles, onPortfolioFilesChange }: PortfolioUploadProps) => {
  return (
    <div>
      <Label>Portfolio</Label>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <div className="text-sm text-gray-600 mb-2">
          {portfolioFiles.length > 0 ? `${portfolioFiles.length} files selected` : 'Upload your best work samples'}
        </div>
        <input
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={(e) => onPortfolioFilesChange(Array.from(e.target.files || []))}
          className="hidden"
          id="portfolio-upload"
        />
        <Button type="button" variant="outline" asChild>
          <label htmlFor="portfolio-upload" className="cursor-pointer">
            Choose Files
          </label>
        </Button>
      </div>
    </div>
  );
};
