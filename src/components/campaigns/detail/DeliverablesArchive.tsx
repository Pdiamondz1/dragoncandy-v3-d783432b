import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useFileUploads } from '@/hooks/useFileQuery';
import { formatFileSize } from '@/lib/fileUtils';

interface DeliverablesArchiveProps {
  campaignId: string;
}

export const DeliverablesArchive: React.FC<DeliverablesArchiveProps> = ({
  campaignId,
}) => {
  const { toast } = useToast();
  const { data: files, isLoading } = useFileUploads(campaignId, 'deliverable');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const downloadFile = async (file: {
    id: string;
    bucket_name: string;
    file_path: string;
    original_filename: string;
  }) => {
    setDownloadingId(file.id);
    try {
      const { data } = await supabase.storage
        .from(file.bucket_name)
        .download(file.file_path);
      if (data) {
        const url = window.URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.original_filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not download file.' });
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadAll = async () => {
    if (!files || files.length === 0) return;
    setDownloadingAll(true);
    try {
      for (const file of files) {
        await downloadFile(file);
      }
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-gray-900 text-sm">Deliverables</h3>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading files…
        </div>
      )}

      {!isLoading && (!files || files.length === 0) && (
        <div className="text-center py-4">
          <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">No deliverables uploaded yet.</p>
        </div>
      )}

      {files && files.length > 0 && (
        <>
          {/* File grid */}
          <div className="grid grid-cols-3 gap-2">
            {files.map(file => {
              const isImage = file.mime_type?.startsWith('image/');
              const isVideo = file.mime_type?.startsWith('video/');
              const publicUrl = isImage
                ? supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl
                : null;

              return (
                <button
                  key={file.id}
                  onClick={() => downloadFile(file)}
                  disabled={downloadingId === file.id}
                  className="aspect-square rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center relative group hover:border-teal-400 transition-colors"
                  title={file.original_filename}
                >
                  {downloadingId === file.id && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
                    </div>
                  )}
                  {isImage && publicUrl ? (
                    <img
                      src={publicUrl}
                      alt={file.original_filename}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="text-center p-1">
                      {isVideo
                        ? <span className="text-2xl">🎥</span>
                        : <FileText className="h-6 w-6 text-gray-400 mx-auto" />
                      }
                      <p className="text-xs text-gray-400 mt-1 truncate w-full px-1">
                        {file.original_filename.split('.').pop()?.toUpperCase()}
                      </p>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                    {formatFileSize(file.file_size)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Download All */}
          <Button
            onClick={downloadAll}
            disabled={downloadingAll}
            className="w-full rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold"
          >
            {downloadingAll ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Downloading…</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Download All ({files.length})</>
            )}
          </Button>
        </>
      )}
    </div>
  );
};
