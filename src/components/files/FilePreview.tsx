
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Share2, MessageSquare, Clock, User, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatFileSize, getFileTypeCategory } from '@/lib/fileUtils';
import type { FileUpload } from '@/types/files';
import FileCommentsPanel from './FileCommentsPanel';

interface FilePreviewProps {
  file: FileUpload;
  isOpen?: boolean;
  onClose?: () => void;
  showDetails?: boolean;
  className?: string;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  file,
  isOpen,
  onClose,
  showDetails = false,
  className = ''
}) => {
  const [fileUrl, setFileUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getFileUrl = async () => {
      try {
        const { data } = await supabase.storage
          .from(file.bucket_name)
          .createSignedUrl(file.file_path, 3600);
        
        if (data?.signedUrl) {
          setFileUrl(data.signedUrl);
        }
      } catch (error) {
        console.error('Error getting file URL:', error);
      } finally {
        setLoading(false);
      }
    };

    getFileUrl();
  }, [file]);

  const downloadFile = () => {
    if (fileUrl) {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = file.original_filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!fileUrl) {
      return (
        <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
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
          />
        );
      
      case 'video':
        return (
          <video
            controls
            className={`max-w-full max-h-96 rounded-lg ${className}`}
            poster={fileUrl}
          >
            <source src={fileUrl} type={file.mime_type} />
            Your browser does not support the video tag.
          </video>
        );
      
      case 'audio':
        return (
          <div className="p-8 bg-gray-50 rounded-lg text-center">
            <audio controls className="w-full">
              <source src={fileUrl} type={file.mime_type} />
              Your browser does not support the audio tag.
            </audio>
          </div>
        );
      
      case 'document':
        return (
          <div className="p-8 bg-gray-50 rounded-lg text-center">
            <div className="text-6xl mb-4">📄</div>
            <p className="text-gray-600 mb-4">Document preview not available</p>
            <Button onClick={downloadFile}>
              <Download className="h-4 w-4 mr-2" />
              Download to View
            </Button>
          </div>
        );
      
      default:
        return (
          <div className="p-8 bg-gray-50 rounded-lg text-center">
            <div className="text-6xl mb-4">📁</div>
            <p className="text-gray-600 mb-4">Preview not available for this file type</p>
            <Button onClick={downloadFile}>
              <Download className="h-4 w-4 mr-2" />
              Download File
            </Button>
          </div>
        );
    }
  };

  if (!showDetails && !isOpen) {
    return renderPreview();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{file.original_filename}</span>
            <Badge variant="secondary">
              {getFileTypeCategory(file.mime_type)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="preview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="comments">
              Comments
              {file.comments && file.comments.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {file.comments.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={downloadFile}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button variant="outline">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
            
            <div className="flex justify-center">
              {renderPreview()}
            </div>
          </TabsContent>

          <TabsContent value="details" className="space-y-6">
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
          </TabsContent>

          <TabsContent value="comments">
            <FileCommentsPanel fileId={file.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default FilePreview;
