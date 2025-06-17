
import React from 'react';
import { useFileUploadLogic } from '@/hooks/useFileUploadLogic';
import FileUploadDropzone from './FileUploadDropzone';
import FileValidationErrors from './FileValidationErrors';
import FileUploadProgressComponent from './FileUploadProgress';

interface EnhancedFileUploadProps {
  bucketName: string;
  campaignId?: string;
  category?: string;
  maxFiles?: number;
  acceptedTypes?: string[];
  onUploadComplete?: (files: any[]) => void;
  className?: string;
}

const EnhancedFileUpload: React.FC<EnhancedFileUploadProps> = ({
  bucketName,
  campaignId,
  category = 'general',
  maxFiles = 10,
  acceptedTypes,
  onUploadComplete,
  className = ''
}) => {
  const {
    uploadQueue,
    validationErrors,
    processFileUpload,
    removeFromQueue
  } = useFileUploadLogic({
    bucketName,
    campaignId,
    category,
    onUploadComplete
  });

  return (
    <div className={className}>
      <FileUploadDropzone
        maxFiles={maxFiles}
        acceptedTypes={acceptedTypes}
        onDrop={processFileUpload}
      />

      <FileValidationErrors errors={validationErrors} />

      <FileUploadProgressComponent
        uploadQueue={uploadQueue}
        onRemoveFromQueue={removeFromQueue}
      />
    </div>
  );
};

export default EnhancedFileUpload;
