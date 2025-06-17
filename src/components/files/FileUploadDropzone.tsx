
import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface FileUploadDropzoneProps {
  maxFiles: number;
  acceptedTypes?: string[];
  onDrop: (files: File[]) => void;
  className?: string;
}

const FileUploadDropzone: React.FC<FileUploadDropzoneProps> = ({
  maxFiles,
  acceptedTypes,
  onDrop,
  className = ''
}) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept: acceptedTypes ? Object.fromEntries(acceptedTypes.map(type => [type, []])) : undefined
  });

  return (
    <div className={className}>
      <Card
        {...getRootProps()}
        className={`p-8 border-2 border-dashed cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-2">
            {isDragActive ? 'Drop files here' : 'Upload files'}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Drag and drop files here, or click to select files
          </p>
          <Button type="button" variant="outline">
            Choose Files
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default FileUploadDropzone;
