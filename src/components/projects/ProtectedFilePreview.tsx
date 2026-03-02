import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Eye, FileText, Lock, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedFilePreviewProps {
  file: {
    id: string;
    original_filename: string;
    file_size: number;
    mime_type: string;
    file_path: string;
    bucket_name: string;
  };
  contentStatus: string | null;
  isBusinessClient: boolean;
}

const ProtectedFilePreview: React.FC<ProtectedFilePreviewProps> = ({
  file,
  contentStatus,
  isBusinessClient,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);

  const isApproved = contentStatus === 'approved';
  const isImage = file.mime_type?.startsWith('image/');
  const isVideo = file.mime_type?.startsWith('video/');
  const canDownload = isApproved || !isBusinessClient;

  const fetchPreviewUrl = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.storage
        .from(file.bucket_name)
        .createSignedUrl(file.file_path, 3600);
      if (data?.signedUrl) {
        setPreviewUrl(data.signedUrl);
      }
    } catch (err) {
      console.error('Error fetching preview URL:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!previewUrl) await fetchPreviewUrl();
    setShowPreview(true);
  };

  const handleDownload = async () => {
    if (!canDownload) return;
    let url = previewUrl;
    if (!url) {
      const { data } = await supabase.storage
        .from(file.bucket_name)
        .createSignedUrl(file.file_path, 3600);
      url = data?.signedUrl || null;
    }
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.download = file.original_filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const fileSizeMB = (file.file_size / 1024 / 1024).toFixed(2);

  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden">
      {/* File Info Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium text-sm">{file.original_filename}</p>
            <p className="text-xs text-muted-foreground">{fileSizeMB} MB</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isApproved && isBusinessClient && (
            <Badge variant="outline" className="text-xs gap-1">
              <Lock className="h-3 w-3" />
              Preview Only
            </Badge>
          )}
          {(isImage || isVideo) && (
            <Button variant="outline" size="sm" onClick={handlePreview} disabled={loading}>
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>
          )}
          {canDownload ? (
            <Button variant="default" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled className="text-xs">
              <Lock className="h-4 w-4 mr-1" />
              Download after approval
            </Button>
          )}
        </div>
      </div>

      {/* Preview Area */}
      {showPreview && previewUrl && (
        <div className="border-t">
          {isImage && (
            <div
              className="relative select-none"
              onContextMenu={(e) => {
                if (!isApproved && isBusinessClient) e.preventDefault();
              }}
            >
              <img
                src={previewUrl}
                alt={file.original_filename}
                className="w-full max-h-96 object-contain"
                draggable={false}
              />
              {!isApproved && isBusinessClient && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                  <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-8 -rotate-30 scale-150 opacity-20">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span
                        key={i}
                        className="text-2xl font-black tracking-[0.3em] text-foreground whitespace-nowrap"
                      >
                        PREVIEW ONLY — DRAGONCANDY
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {isVideo && (
            <div
              className="relative"
              onContextMenu={(e) => {
                if (!isApproved && isBusinessClient) e.preventDefault();
              }}
            >
              <video
                src={previewUrl}
                controls
                controlsList={!isApproved && isBusinessClient ? 'nodownload' : undefined}
                disablePictureInPicture={!isApproved && isBusinessClient}
                className="w-full max-h-96"
              />
              {!isApproved && isBusinessClient && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-8 -rotate-30 scale-150 opacity-15">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span
                        key={i}
                        className="text-2xl font-black tracking-[0.3em] text-foreground whitespace-nowrap"
                      >
                        PREVIEW — DRAGONCANDY
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProtectedFilePreview;
