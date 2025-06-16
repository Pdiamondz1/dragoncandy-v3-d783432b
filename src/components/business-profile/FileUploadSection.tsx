
import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface FileUploadSectionProps {
  logoFile: File | null;
  sampleFiles: File[];
  onLogoChange: (file: File | null) => void;
  onSampleFilesChange: (files: File[]) => void;
}

export const FileUploadSection = ({ 
  logoFile, 
  sampleFiles, 
  onLogoChange, 
  onSampleFilesChange 
}: FileUploadSectionProps) => {
  return (
    <>
      {/* Logo Upload */}
      <div>
        <Label>Business Logo</Label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <div className="text-sm text-gray-600 mb-2">
            {logoFile ? logoFile.name : 'Click to upload your logo'}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onLogoChange(e.target.files?.[0] || null)}
            className="hidden"
            id="logo-upload"
          />
          <Button type="button" variant="outline" asChild>
            <label htmlFor="logo-upload" className="cursor-pointer">
              Choose File
            </label>
          </Button>
        </div>
      </div>

      {/* Sample Content Upload */}
      <div>
        <Label>Sample/Preferred Content</Label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <div className="text-sm text-gray-600 mb-2">
            {sampleFiles.length > 0 ? `${sampleFiles.length} files selected` : 'Upload sample content that represents your brand'}
          </div>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(e) => onSampleFilesChange(Array.from(e.target.files || []))}
            className="hidden"
            id="sample-upload"
          />
          <Button type="button" variant="outline" asChild>
            <label htmlFor="sample-upload" className="cursor-pointer">
              Choose Files
            </label>
          </Button>
        </div>
      </div>
    </>
  );
};
