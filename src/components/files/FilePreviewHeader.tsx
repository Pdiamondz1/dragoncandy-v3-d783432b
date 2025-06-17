
import React from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { getFileTypeCategory } from '@/lib/fileUtils';
import type { FileUpload } from '@/types/files';

interface FilePreviewHeaderProps {
  file: FileUpload;
}

const FilePreviewHeader: React.FC<FilePreviewHeaderProps> = ({ file }) => {
  return (
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <span className="truncate">{file.original_filename}</span>
        <Badge variant="secondary">
          {getFileTypeCategory(file.mime_type)}
        </Badge>
      </DialogTitle>
    </DialogHeader>
  );
};

export default FilePreviewHeader;
