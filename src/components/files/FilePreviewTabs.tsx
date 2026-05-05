
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Share2 } from 'lucide-react';
import type { FileUpload } from '@/types/files';
import { FilePreviewContent } from './FilePreviewContent';
import { FileDetailsPanel } from './FileDetailsPanel';
import { FileCommentsPanel } from './FileCommentsPanel';

interface FilePreviewTabsProps {
  file: FileUpload;
  fileUrl: string;
  loading: boolean;
  onDownload: () => void;
}

export const FilePreviewTabs: React.FC<FilePreviewTabsProps> = ({
  file,
  fileUrl,
  loading,
  onDownload
}) => {
  return (
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
          <Button variant="outline" onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button variant="outline">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
        
        <div className="flex justify-center">
          <FilePreviewContent
            file={file}
            fileUrl={fileUrl}
            loading={loading}
            onDownload={onDownload}
          />
        </div>
      </TabsContent>

      <TabsContent value="details" className="space-y-6">
        <FileDetailsPanel file={file} />
      </TabsContent>

      <TabsContent value="comments">
        <FileCommentsPanel fileId={file.id} />
      </TabsContent>
    </Tabs>
  );
};

