
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { FileRejection } from 'react-dropzone';
import { useAuth } from '@/hooks/useAuth';
import { useProjectFileUpload } from '@/hooks/useProjectFileUpload';
import { FileUploadDropzone } from './upload/FileUploadDropzone';
import { FileUploadPreview } from './upload/FileUploadPreview';

interface ProjectFileUploadProps {
  campaignId: string;
  campaignTitle: string;
  onUploadComplete?: () => void;
}

export const ProjectFileUpload: React.FC<ProjectFileUploadProps> = ({
  campaignId,
  campaignTitle,
  onUploadComplete
}) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<FileRejection[]>([]);

  const { uploadProgress, isUploading, handleUpload } = useProjectFileUpload({
    campaignId,
    campaignTitle,
    onUploadComplete: () => {
      setIsOpen(false);
      setSelectedFiles([]);
      setRejectedFiles([]);
      if (onUploadComplete) onUploadComplete();
    }
  });

  const handleFileDrop = (acceptedFiles: File[], fileRejections: FileRejection[]) => {
    setSelectedFiles(acceptedFiles);
    setRejectedFiles(fileRejections);
  };

  const onUpload = () => {
    if (selectedFiles.length > 0) {
      handleUpload(selectedFiles);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedFiles([]);
    setRejectedFiles([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex-1">
          <Upload className="h-4 w-4 mr-2" />
          Upload Work
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Deliverables for {campaignTitle}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <FileUploadDropzone
            onDrop={handleFileDrop}
            acceptedFiles={selectedFiles}
            fileRejections={rejectedFiles}
          />

          <FileUploadPreview
            files={selectedFiles}
            uploadProgress={uploadProgress}
          />

          {/* Upload Button */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={onUpload}
              disabled={selectedFiles.length === 0 || isUploading || !user}
            >
              {isUploading ? 'Uploading…' : `Upload ${selectedFiles.length} file(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

