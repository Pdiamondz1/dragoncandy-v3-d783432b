
import React from 'react';
import { File, Image, Video } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface FileUploadPreviewProps {
  files: File[];
  uploadProgress: {[key: string]: number};
}

const FileUploadPreview: React.FC<FileUploadPreviewProps> = ({
  files,
  uploadProgress
}) => {
  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (file.type.startsWith('video/')) return <Video className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="font-medium text-gray-700">Files to upload:</h4>
      {files.map((file) => (
        <div key={file.name} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg overflow-hidden">
          <div className="flex-shrink-0 text-gray-500">
            {getFileIcon(file)}
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-sm font-medium text-gray-700 truncate max-w-full">{file.name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
          </div>
          {uploadProgress[file.name] !== undefined && (
            <div className="w-24 flex-shrink-0">
              <Progress value={uploadProgress[file.name]} className="h-2" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default FileUploadPreview;
