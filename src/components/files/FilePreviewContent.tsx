
import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { getFileTypeCategory } from '@/lib/fileUtils';
import type { FileUpload } from '@/types/files';
import { Spinner } from '@/components/ui/spinner';

interface FilePreviewContentProps {
  file: FileUpload;
  fileUrl: string;
  loading: boolean;
  onDownload: () => void;
  className?: string;
}

export const FilePreviewContent: React.FC<FilePreviewContentProps> = ({
  file,
  fileUrl,
  loading,
  onDownload,
  className = ''
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-dc-teal/[0.04] rounded-lg">
        <Spinner className="border-dc-teal" label="Loading file preview..." />
      </div>
    );
  }

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center h-64 bg-dc-teal/[0.04] rounded-lg">
        <p className="text-gray-500">Unable to load preview</p>
      </div>
    );
  }

  const fileType = getFileTypeCategory(file.mime_type);

  switch (fileType) {
    case 'image':
      return (
        <img
          src={fileUrl}
          alt={file.original_filename}
          className={`max-w-full max-h-96 object-contain rounded-lg ${className}`}
          loading="lazy"
        />
      );
    
    case 'video':
      return (
        <video
          controls
          aria-label="File preview"
          className={`max-w-full max-h-96 rounded-lg ${className}`}
          poster={fileUrl}
        >
          <source src={fileUrl} type={file.mime_type} />
          Your browser does not support the video tag.
        </video>
      );
    
    case 'audio':
      return (
        <div className="p-8 bg-dc-teal/[0.04] rounded-lg text-center">
          <audio controls aria-label="File audio preview" className="w-full">
            <source src={fileUrl} type={file.mime_type} />
            Your browser does not support the audio tag.
          </audio>
        </div>
      );
    
    case 'document':
      return (
        <div className="p-8 bg-dc-teal/[0.04] rounded-lg text-center">
          <div className="text-6xl mb-4">📄</div>
          <p className="text-gray-600 mb-4">Document preview not available</p>
          <Button onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download to View
          </Button>
        </div>
      );
    
    default:
      return (
        <div className="p-8 bg-dc-teal/[0.04] rounded-lg text-center">
          <div className="text-6xl mb-4">📁</div>
          <p className="text-gray-600 mb-4">Preview not available for this file type</p>
          <Button onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download File
          </Button>
        </div>
      );
  }
};

