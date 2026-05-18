
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
  deliverableId?: string;
  deliverableLabel?: string;
  acceptFilter?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUploadComplete?: () => void;
}

export const ProjectFileUpload: React.FC<ProjectFileUploadProps> = ({
  campaignId,
  campaignTitle,
  deliverableId,
  deliverableLabel,
  acceptFilter,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onUploadComplete
}) => {
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<FileRejection[]>([]);

  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  if (process.env.NODE_ENV !== 'production' && (controlledOpen !== undefined) !== (controlledOnOpenChange !== undefined)) {
    console.warn('ProjectFileUpload: provide both `open` and `onOpenChange`, or neither.');
  }
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setIsOpen = (value: boolean) => {
    if (isControlled && controlledOnOpenChange) {
      controlledOnOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };

  const acceptOverride: Record<string, string[]> | undefined = acceptFilter
    ? { [acceptFilter]: [] }
    : undefined;

  const { uploadProgress, uploadStatus, isUploading, handleUpload } = useProjectFileUpload({
    campaignId,
    campaignTitle,
    deliverableId,
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

  const dialogTitle = deliverableLabel
    ? `Upload: ${deliverableLabel}`
    : `Upload Deliverables for ${campaignTitle}`;

  const dialogContent = (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{dialogTitle}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <FileUploadDropzone
          onDrop={handleFileDrop}
          fileRejections={rejectedFiles}
          acceptOverride={acceptOverride}
        />

        <FileUploadPreview
          files={selectedFiles}
          uploadProgress={uploadProgress}
          uploadStatus={uploadStatus}
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
  );

  if (isControlled) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex-1">
          <Upload className="h-4 w-4 mr-2" />
          Upload Work
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
};

