import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { Upload, X, Play, FileImage, FileVideo } from 'lucide-react';
import type { StagedFile } from '@/types/campaignMedia';

interface MediaUploaderProps {
  mediaType: 'reference_image' | 'reference_video' | 'raw_footage';
  maxFiles: number;
  onFilesChange: (files: StagedFile[]) => void;
  existingFiles?: StagedFile[];
  className?: string;
}

const IMAGE_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

const VIDEO_TYPES: Record<string, string[]> = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
};

const IMAGE_MAX_BYTES = 50 * 1024 * 1024; // 50MB
const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100MB
const VIDEO_MAX_DURATION = 60; // seconds

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video metadata'));
    };
    video.src = url;
  });
}

export function MediaUploader({
  mediaType,
  maxFiles,
  onFilesChange,
  existingFiles = [],
  className = '',
}: MediaUploaderProps) {
  const [files, setFiles] = useState<StagedFile[]>(existingFiles);
  const previewUrls = useRef<string[]>([]);

  // Track preview URLs created in this component for cleanup
  useEffect(() => {
    return () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const isVideo = mediaType === 'reference_video' || mediaType === 'raw_footage';
  const acceptTypes = isVideo ? VIDEO_TYPES : IMAGE_TYPES;
  const maxBytes = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;

  const processFiles = useCallback(
    async (accepted: File[]) => {
      const current = files;
      const remaining = maxFiles - current.length;

      if (remaining <= 0) {
        toast.error(`Maximum ${maxFiles} file${maxFiles !== 1 ? 's' : ''} allowed`);
        return;
      }

      const toProcess = accepted.slice(0, remaining);
      const newStaged: StagedFile[] = [];

      for (const file of toProcess) {
        // Size check
        if (file.size > maxBytes) {
          const limit = isVideo ? '100MB' : '50MB';
          toast.error(`"${file.name}" exceeds the ${limit} size limit`);
          continue;
        }

        // Duration check for videos
        if (isVideo) {
          try {
            const duration = await getVideoDuration(file);
            if (duration > VIDEO_MAX_DURATION) {
              toast.error(`"${file.name}" exceeds the 60-second duration limit`);
              continue;
            }
            const preview = URL.createObjectURL(file);
            previewUrls.current.push(preview);
            newStaged.push({
              file,
              preview,
              name: file.name,
              size: file.size,
              type: file.type,
              duration,
            });
          } catch {
            toast.error(`Could not read video metadata for "${file.name}"`);
          }
        } else {
          const preview = URL.createObjectURL(file);
          previewUrls.current.push(preview);
          newStaged.push({
            file,
            preview,
            name: file.name,
            size: file.size,
            type: file.type,
          });
        }
      }

      if (accepted.length > remaining) {
        toast.error(`Only ${remaining} more file${remaining !== 1 ? 's' : ''} can be added`);
      }

      if (newStaged.length > 0) {
        const updated = [...current, ...newStaged];
        setFiles(updated);
        onFilesChange(updated);
      }
    },
    [files, maxFiles, maxBytes, isVideo, onFilesChange],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      void processFiles(accepted);
    },
    [processFiles],
  );

  const removeFile = useCallback(
    (index: number) => {
      const updated = files.filter((_, i) => i !== index);
      setFiles(updated);
      onFilesChange(updated);
    },
    [files, onFilesChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptTypes,
    maxFiles,
    noClick: false,
  });

  const fileLabel = isVideo ? 'video' : 'image';
  const acceptedFormats = isVideo ? 'MP4, MOV, WebM' : 'JPEG, PNG, WebP';
  const sizeLimit = isVideo ? '100MB, max 60s' : '50MB';

  return (
    <div className={className}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`rounded-xl border-2 border-dashed cursor-pointer transition-colors p-6 text-center bg-gray-100
          ${isDragActive ? 'border-teal-400 bg-teal-50' : 'border-gray-300 hover:border-teal-300 hover:bg-gray-50'}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          {isVideo ? (
            <FileVideo className="w-8 h-8 text-gray-400" />
          ) : (
            <FileImage className="w-8 h-8 text-gray-400" />
          )}
          <Upload className="w-5 h-5 text-teal-400" />
          <p className="text-sm font-medium text-gray-700">
            {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-xs text-gray-500">or click to browse</p>
          <p className="text-xs text-gray-400">
            {acceptedFormats} &middot; up to {sizeLimit} per {fileLabel}
          </p>
        </div>
      </div>

      {/* File count */}
      {maxFiles > 0 && (
        <p className="mt-2 text-xs text-gray-500 text-right">
          {files.length} of {maxFiles} file{maxFiles !== 1 ? 's' : ''}
        </p>
      )}

      {/* Thumbnail grid */}
      {files.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {files.map((staged, index) => (
            <div key={`${staged.name}-${index}`} className="relative rounded-lg overflow-hidden bg-gray-200 aspect-square">
              {/* Preview */}
              {staged.type.startsWith('video/') ? (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                  <video
                    src={staged.preview}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 rounded-full p-2">
                      <Play className="w-5 h-5 text-white fill-white" />
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src={staged.preview}
                  alt={staged.name}
                  className="w-full h-full object-cover"
                />
              )}

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 transition-colors"
                aria-label={`Remove ${staged.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* File info bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                <p className="text-white text-xs truncate">{staged.name}</p>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-gray-300 text-[10px]">{formatSize(staged.size)}</span>
                  {staged.duration != null && (
                    <span className="text-gray-300 text-[10px]">{staged.duration.toFixed(1)}s</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
