
import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Clock, User, Eye } from 'lucide-react';
import { formatFileSize } from '@/lib/fileUtils';
import type { FileUpload } from '@/types/files';

interface FileDetailsPanelProps {
  file: FileUpload;
}

export const FileDetailsPanel: React.FC<FileDetailsPanelProps> = ({ file }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-500">File Name</label>
            <p className="mt-1">{file.original_filename}</p>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-500">Size</label>
            <p className="mt-1">{formatFileSize(file.file_size)}</p>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-500">Type</label>
            <p className="mt-1">{file.mime_type}</p>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-500">Category</label>
            <p className="mt-1 capitalize">{file.file_category}</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Uploaded By</label>
            <div className="mt-1 flex items-center gap-2">
              <User className="h-4 w-4 text-gray-400" />
              <span>{file.uploader_profile?.full_name || 'Unknown'}</span>
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-500">Upload Date</label>
            <div className="mt-1 flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <span>{new Date(file.created_at).toLocaleString()}</span>
            </div>
          </div>
          
          {file.is_compressed && (
            <div>
              <label className="text-sm font-medium text-gray-500">Compression</label>
              <p className="mt-1">
                {Math.round((file.compression_ratio || 0) * 100)}% reduction
              </p>
            </div>
          )}
          
          <div>
            <label className="text-sm font-medium text-gray-500">Permissions</label>
            <div className="mt-1 flex items-center gap-2">
              <Eye className="h-4 w-4 text-gray-400" />
              <span>{file.is_public ? 'Public' : 'Private'}</span>
            </div>
          </div>
        </div>
      </div>

      {file.versions && file.versions.length > 0 && (
        <div>
          <h4 className="font-medium mb-3">Version History</h4>
          <div className="space-y-2">
            {file.versions.map((version) => (
              <div key={version.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Version {version.version_number}</p>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(version.file_size)} • {new Date(version.created_at).toLocaleDateString()}
                  </p>
                  {version.changes_description && (
                    <p className="text-sm text-gray-600 mt-1">{version.changes_description}</p>
                  )}
                </div>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

