
import React, { useState } from 'react';
import { useFileUploads, useDeleteFileUpload } from '@/hooks/useFileOperations';
import { getFileTypeCategory } from '@/lib/fileUtils';
import { supabase } from '@/integrations/supabase/client';
import type { FileUpload } from '@/types/files';
import FileManagerHeader from './FileManagerHeader';
import FileGrid from './FileGrid';
import FilePreview from './FilePreview';
import FilePermissionsDialog from './FilePermissionsDialog';

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

  const handleFileShare = (file: FileUpload) => {
    setSelectedFile(file);
    setShowPermissions(true);
  };

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header and Controls */}
      <FileManagerHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterType={filterType}
        onFilterChange={setFilterType}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* File List/Grid */}
      <FileGrid
        files={filteredFiles}
        viewMode={viewMode}
        searchQuery={searchQuery}
        filterType={filterType}
        onFileSelect={setSelectedFile}
        onFileDownload={downloadFile}
        onFileShare={handleFileShare}
        onFileDelete={handleDeleteFile}
      />

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
