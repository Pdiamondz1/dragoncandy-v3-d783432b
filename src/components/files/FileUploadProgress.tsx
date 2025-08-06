import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { File, X, Check, CheckCircle } from 'lucide-react';
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

  const completedFiles = uploadQueue.filter(item => item.status === 'completed');
  const inProgressFiles = uploadQueue.filter(item => item.status !== 'completed');

  return (
    <Card className="mt-4 p-4">
      <h4 className="font-medium mb-4">Upload Progress</h4>
      
      {/* Show success message for completed uploads */}
      {completedFiles.length > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">
              {completedFiles.length} file{completedFiles.length > 1 ? 's' : ''} uploaded successfully!
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {completedFiles.map((item) => (
              <div key={item.fileId} className="text-xs text-green-700">
                ✓ {item.filename || 'Unnamed file'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Show progress for in-progress uploads */}
      {inProgressFiles.length > 0 && (
        <div className="space-y-3">
          {inProgressFiles.map((item) => (
            <div key={item.fileId} className="flex items-center gap-3">
              <File className="h-5 w-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.filename || `File ${inProgressFiles.indexOf(item) + 1}`}
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
      )}
    </Card>
  );
};

export default FileUploadProgressComponent;