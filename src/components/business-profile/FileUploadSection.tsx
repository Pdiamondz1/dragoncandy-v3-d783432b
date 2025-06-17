
import React from 'react';
import { Label } from '@/components/ui/label';
import EnhancedFileUpload from '@/components/files/EnhancedFileUpload';

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
        <EnhancedFileUpload
          bucketName="profile-media"
          category="logo"
          maxFiles={1}
          acceptedTypes={['image/jpeg', 'image/png', 'image/gif', 'image/webp']}
          onUploadComplete={(files) => {
            if (files.length > 0) {
              // Convert to File object for backward compatibility
              const file = new File([], files[0].original_filename);
              onLogoChange(file);
            }
          }}
          className="mt-2"
        />
      </div>

      {/* Sample Content Upload */}
      <div>
        <Label>Sample/Preferred Content</Label>
        <EnhancedFileUpload
          bucketName="profile-media"
          category="sample"
          maxFiles={10}
          acceptedTypes={['image/*', 'video/*']}
          onUploadComplete={(files) => {
            // Convert to File objects for backward compatibility
            const fileObjects = files.map(f => new File([], f.original_filename));
            onSampleFilesChange(fileObjects);
          }}
          className="mt-2"
        />
      </div>
    </>
  );
};
