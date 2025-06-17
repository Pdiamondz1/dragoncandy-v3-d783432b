
import React from 'react';
import type { FileUpload } from '@/types/files';
import FileCard from './FileCard';
import EmptyFileState from './EmptyFileState';

interface FileGridProps {
  files: FileUpload[];
  viewMode: 'grid' | 'list';
  searchQuery: string;
  filterType: string;
  onFileSelect: (file: FileUpload) => void;
  onFileDownload: (file: FileUpload) => void;
  onFileShare: (file: FileUpload) => void;
  onFileDelete: (file: FileUpload) => void;
}

const FileGrid: React.FC<FileGridProps> = ({
  files,
  viewMode,
  searchQuery,
  filterType,
  onFileSelect,
  onFileDownload,
  onFileShare,
  onFileDelete
}) => {
  if (files.length === 0) {
    return <EmptyFileState searchQuery={searchQuery} filterType={filterType} />;
  }

  return (
    <div className={viewMode === 'grid' 
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
      : 'space-y-2'
    }>
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          viewMode={viewMode}
          onSelect={onFileSelect}
          onDownload={onFileDownload}
          onShare={onFileShare}
          onDelete={onFileDelete}
        />
      ))}
    </div>
  );
};

export default FileGrid;
