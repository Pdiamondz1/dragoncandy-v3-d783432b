
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Filter, Grid, List, Download, Share2, MoreHorizontal, Folder, File } from 'lucide-react';
import { useFileUploads, useDeleteFileUpload } from '@/hooks/useFileOperations';
import { formatFileSize, getFileTypeCategory } from '@/lib/fileUtils';
import { supabase } from '@/integrations/supabase/client';
import type { FileUpload } from '@/types/files';
import FilePreview from './FilePreview';
import FilePermissionsDialog from './FilePermissionsDialog';
import FileCommentsPanel from './FileCommentsPanel';

interface FileManagerProps {
  campaignId?: string;
  bucketName?: string;
  category?: string;
  showUpload?: boolean;
  className?: string;
}

const FileManager: React.FC<FileManagerProps> = ({
  campaignId,
  bucketName,
  category,
  showUpload = true,
  className = ''
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedFile, setSelectedFile] = useState<FileUpload | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const { data: files = [], isLoading } = useFileUploads(campaignId, category);
  const deleteFile = useDeleteFileUpload();

  // Filter files based on search and type
  const filteredFiles = files.filter(file => {
    const matchesSearch = file.original_filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         file.file_category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || getFileTypeCategory(file.mime_type) === filterType;
    const matchesBucket = !bucketName || file.bucket_name === bucketName;
    return matchesSearch && matchesType && matchesBucket;
  });

  const getFileUrl = async (file: FileUpload) => {
    const { data } = await supabase.storage
      .from(file.bucket_name)
      .createSignedUrl(file.file_path, 3600); // 1 hour expiry
    return data?.signedUrl;
  };

  const downloadFile = async (file: FileUpload) => {
    const url = await getFileUrl(file);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.download = file.original_filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDeleteFile = async (file: FileUpload) => {
    if (confirm(`Are you sure you want to delete "${file.original_filename}"?`)) {
      // Delete from storage
      await supabase.storage
        .from(file.bucket_name)
        .remove([file.file_path]);
      
      // Delete from database
      deleteFile.mutate(file.id);
    }
  };

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="h-20 bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="video">Videos</SelectItem>
              <SelectItem value="document">Documents</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          >
            {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* File List/Grid */}
      {filteredFiles.length === 0 ? (
        <Card className="p-8 text-center">
          <Folder className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No files found</h3>
          <p className="text-gray-500">
            {searchQuery || filterType !== 'all' 
              ? 'Try adjusting your search or filters'
              : 'Upload some files to get started'
            }
          </p>
        </Card>
      ) : (
        <div className={viewMode === 'grid' 
          ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
          : 'space-y-2'
        }>
          {filteredFiles.map((file) => (
            <Card
              key={file.id}
              className={`p-4 hover:shadow-md transition-shadow cursor-pointer ${
                viewMode === 'list' ? 'flex items-center gap-4' : ''
              }`}
              onClick={() => setSelectedFile(file)}
            >
              {viewMode === 'grid' ? (
                <div className="space-y-3">
                  <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                    {file.mime_type.startsWith('image/') ? (
                      <FilePreview file={file} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <File className="h-8 w-8 text-gray-400" />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm truncate" title={file.original_filename}>
                      {file.original_filename}
                    </h4>
                    <div className="flex items-center justify-between text-xs text-gray-500">
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
                        downloadFile(file);
                      }}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(file);
                        setShowPermissions(true);
                      }}
                    >
                      <Share2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(file);
                      }}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-shrink-0">
                    {file.mime_type.startsWith('image/') ? (
                      <FilePreview file={file} className="w-12 h-12 object-cover rounded" />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                        <File className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{file.original_filename}</h4>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
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
                        downloadFile(file);
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(file);
                        setShowPermissions(true);
                      }}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* File Details Modal */}
      {selectedFile && !showPermissions && (
        <FilePreview
          file={selectedFile}
          isOpen={!!selectedFile}
          onClose={() => setSelectedFile(null)}
          showDetails
        />
      )}

      {/* Permissions Dialog */}
      {selectedFile && showPermissions && (
        <FilePermissionsDialog
          file={selectedFile}
          isOpen={showPermissions}
          onClose={() => {
            setShowPermissions(false);
            setSelectedFile(null);
          }}
        />
      )}
    </div>
  );
};

export default FileManager;
