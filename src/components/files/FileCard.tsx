
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Share2, MoreHorizontal, File } from 'lucide-react';
import { formatFileSize, getFileTypeCategory } from '@/lib/fileUtils';
import type { FileUpload } from '@/types/files';
import { FilePreview } from './FilePreview';

interface FileCardProps {
  file: FileUpload;
  viewMode: 'grid' | 'list';
  onSelect: (file: FileUpload) => void;
  onDownload: (file: FileUpload) => void;
  onShare: (file: FileUpload) => void;
  onDelete: (file: FileUpload) => void;
}

export const FileCard: React.FC<FileCardProps> = ({
  file,
  viewMode,
  onSelect,
  onDownload,
  onShare,
  onDelete
}) => {
  if (viewMode === 'grid') {
    return (
      <Card
        className="p-4 hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => onSelect(file)}
      >
        <div className="space-y-3">
          <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
            {file.mime_type.startsWith('image/') ? (
              <FilePreview file={file} className="w-full h-full object-cover rounded-lg" />
            ) : (
              <File className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium text-sm truncate" title={file.original_filename}>
              {file.original_filename}
            </h4>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatFileSize(file.file_size)}</span>
              <Badge variant="secondary" className="text-xs">
                {getFileTypeCategory(file.mime_type)}
              </Badge>
            </div>
          </div>
          
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onDownload(file);
              }}
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onShare(file);
              }}
            >
              <Share2 className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(file);
              }}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4"
      onClick={() => onSelect(file)}
    >
      <div className="flex-shrink-0">
        {file.mime_type.startsWith('image/') ? (
          <FilePreview file={file} className="w-12 h-12 object-cover rounded" />
        ) : (
          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
            <File className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="font-medium truncate">{file.original_filename}</h4>
        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
          <span>{formatFileSize(file.file_size)}</span>
          <Badge variant="secondary" className="text-xs">
            {getFileTypeCategory(file.mime_type)}
          </Badge>
          <span>{new Date(file.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file);
          }}
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onShare(file);
          }}
        >
          <Share2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
};

