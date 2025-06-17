
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import type { FileUpload } from '@/types/files';
import FilePreviewHeader from './FilePreviewHeader';
import FilePreviewTabs from './FilePreviewTabs';
import FilePreviewContent from './FilePreviewContent';

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

  if (!showDetails && !isOpen) {
    return (
      <FilePreviewContent
        file={file}
        fileUrl={fileUrl}
        loading={loading}
        onDownload={downloadFile}
        className={className}
      />
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <FilePreviewHeader file={file} />
        <FilePreviewTabs
          file={file}
          fileUrl={fileUrl}
          loading={loading}
          onDownload={downloadFile}
        />
      </DialogContent>
    </Dialog>
  );
};

export default FilePreview;
