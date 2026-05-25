import { Trash2, Film, Camera, FileIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useDeleteFileUpload } from '@/hooks/useFileUploadMutations';
import type { FileUpload } from '@/types/files';

interface UploadedFilesListProps {
  files: FileUpload[];
  canDelete: boolean;
}

function formatFileSize(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getThumbnailUrl(file: FileUpload): string | null {
  const meta = file.metadata as Record<string, unknown> | undefined;
  if (meta?.thumbnail_path) {
    return supabase.storage
      .from(file.bucket_name)
      .getPublicUrl(meta.thumbnail_path as string).data.publicUrl;
  }
  if (file.mime_type.startsWith('image/')) {
    return supabase.storage
      .from(file.bucket_name)
      .getPublicUrl(file.file_path).data.publicUrl;
  }
  return null;
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('video/')) return <Film className="h-5 w-5 text-gray-500" />;
  if (mimeType.startsWith('image/')) return <Camera className="h-5 w-5 text-gray-500" />;
  return <FileIcon className="h-5 w-5 text-gray-500" />;
}

export function UploadedFilesList({ files, canDelete }: UploadedFilesListProps) {
  const deleteFile = useDeleteFileUpload();

  if (files.length === 0) return null;

  const handleDelete = async (file: FileUpload) => {
    await supabase.storage.from(file.bucket_name).remove([file.file_path]);
    deleteFile.mutate(file.id);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        Uploaded files
      </p>
      <div className="space-y-1.5">
        {files.map((file) => {
          const thumbUrl = getThumbnailUrl(file);
          return (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-xl bg-teal-50/60 border border-teal-100 px-3 py-2"
            >
              {/* Thumbnail or icon */}
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white border border-gray-200 flex items-center justify-center shrink-0">
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileTypeIcon mimeType={file.mime_type} />
                )}
              </div>

              {/* Name + size */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {file.original_filename}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(file.file_size)}
                </p>
              </div>

              {/* Delete */}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50"
                  disabled={deleteFile.isPending}
                  onClick={() => handleDelete(file)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
