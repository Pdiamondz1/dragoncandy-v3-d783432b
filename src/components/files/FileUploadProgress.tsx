
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { File, X, Check } from 'lucide-react';
import type { FileUploadProgress } from '@/types/files';

interface FileUploadProgressProps {
  uploadQueue: FileUploadProgress[];
  onRemoveFromQueue: (fileId: string) => void;
}

const FileUploadProgressComponent: React.FC<FileUploadProgressProps> = ({
  uploadQueue,
  onRemoveFromQueue
}) => {
  if (uploadQueue.length === 0) return null;

  return (
    <Card className="mt-4 p-4">
      <h4 className="font-medium mb-4">Upload Progress</h4>
      <div className="space-y-3">
        {uploadQueue.map((item) => (
          <div key={item.fileId} className="flex items-center gap-3">
            <File className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  File {uploadQueue.indexOf(item) + 1}
                </p>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={
                      item.status === 'completed' ? 'default' :
                      item.status === 'failed' ? 'destructive' : 'secondary'
                    }
                  >
                    {item.status}
                  </Badge>
                  {item.status === 'completed' && (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                  {item.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemoveFromQueue(item.fileId)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {item.status !== 'failed' && (
                <Progress value={item.progress} className="h-2" />
              )}
              {item.error && (
                <p className="text-xs text-red-600 mt-1">{item.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default FileUploadProgressComponent;
