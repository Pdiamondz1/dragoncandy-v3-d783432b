import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Eye, FileText, Lock } from 'lucide-react';
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
  collaborationId: string;
}

export const ProtectedFilePreview: React.FC<ProtectedFilePreviewProps> = ({
  file,
  contentStatus,
  isBusinessClient,
  collaborationId,
}) => {
  // Optimistic approval check used as initial canDownload to avoid UI flash;
  // the edge function response is the authoritative source
  const isApproved = ['approved', 'auto_approved'].includes(contentStatus || '');
  const isImage = file.mime_type?.startsWith('image/');
  const isVideo = file.mime_type?.startsWith('video/');

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [canDownload, setCanDownload] = useState(isApproved || !isBusinessClient);

  const fetchPreviewUrl = async (): Promise<string | null> => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('get-watermarked-preview', {
        body: {
          file_path: file.file_path,
          bucket_name: file.bucket_name,
          collaboration_id: collaborationId,
        },
      });
      if (response.data?.signed_url) {
        setPreviewUrl(response.data.signed_url);
        setCanDownload(response.data.can_download ?? false);
        return response.data.signed_url;
      }
      return null;
    } catch (err) {
      console.error('Error fetching preview URL:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch URL on mount for images/videos so preview is ready
  useEffect(() => {
    if (isImage || isVideo) {
      fetchPreviewUrl();
    }
  }, [file.file_path, file.bucket_name, collaborationId]);

  const handlePreview = async () => {
    if (!previewUrl) await fetchPreviewUrl();
    setShowPreview(true);
  };

  const handleDownload = async () => {
    if (!canDownload) return;
    const url = previewUrl || await fetchPreviewUrl();
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
          {!canDownload && (
            <Badge variant="outline" className="text-xs gap-1 bg-yellow-100 text-yellow-800 border-yellow-200">
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
                if (!canDownload) e.preventDefault();
              }}
            >
              <img
                src={previewUrl}
                alt={file.original_filename}
                className="w-full max-h-96 object-contain"
                draggable={false}
              />
              {!canDownload && (
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
                if (!canDownload) e.preventDefault();
              }}
            >
              <video
                src={previewUrl}
                controls
                controlsList={!canDownload ? 'nodownload' : undefined}
                disablePictureInPicture={!canDownload}
                className="w-full max-h-96"
              />
              {!canDownload && (
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

