
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/hooks/useAuth';
import { useProjectFileUpload } from '@/hooks/useProjectFileUpload';
import FileUploadDropzone from './upload/FileUploadDropzone';
import FileUploadPreview from './upload/FileUploadPreview';

interface ProjectFileUploadProps {
  campaignId: string;
  campaignTitle: string;
  onUploadComplete?: () => void;
}

const ProjectFileUpload: React.FC<ProjectFileUploadProps> = ({
  campaignId,
  campaignTitle,
  onUploadComplete
}) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const { uploadProgress, isUploading, handleUpload } = useProjectFileUpload({
    campaignId,
    campaignTitle,
    onUploadComplete: () => {
      setIsOpen(false);
      if (onUploadComplete) onUploadComplete();
    }
  });

  const { acceptedFiles, fileRejections, getRootProps, getInputProps } = useDropzone({
    noClick: true,
    noKeyboard: true
  });

  const onUpload = () => {
    handleUpload(acceptedFiles);
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
        
        <div className="space-y-4">
          <FileUploadDropzone
            onDrop={(files) => {
              // Handle the dropped files by updating the dropzone state
              acceptedFiles.length = 0;
              acceptedFiles.push(...files);
            }}
            acceptedFiles={acceptedFiles}
            fileRejections={fileRejections}
          />

          <FileUploadPreview
            files={acceptedFiles}
            uploadProgress={uploadProgress}
          />

          {/* Upload Button */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={onUpload}
              disabled={acceptedFiles.length === 0 || isUploading || !user}
            >
              {isUploading ? 'Uploading...' : `Upload ${acceptedFiles.length} file(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectFileUpload;
