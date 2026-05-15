
import React from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { useDropzone, FileRejection } from 'react-dropzone';

const defaultAccept: Record<string, string[]> = {
  'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
  'video/*': ['.mp4', '.webm', '.mov', '.avi'],
};

interface FileUploadDropzoneProps {
  onDrop: (acceptedFiles: File[], fileRejections: FileRejection[]) => void;
  fileRejections: FileRejection[];
  acceptOverride?: Record<string, string[]>;
}

export const FileUploadDropzone: React.FC<FileUploadDropzoneProps> = ({
  onDrop,
  fileRejections,
  acceptOverride,
}) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles, rejections) => {
      const files = [...acceptedFiles] as File[];
      onDrop(files, rejections);
    },
    accept: acceptOverride ?? defaultAccept,
    maxSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 10,
  });

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-teal-400 bg-teal-50/30' : 'border-teal-300 hover:border-teal-400'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-12 w-12 mx-auto mb-4 text-dc-text-muted" />
        <p className="text-lg font-medium text-dc-text mb-2">
          {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
        </p>
        <p className="text-sm text-dc-text-muted mb-4">
          or click to select files
        </p>
        <p className="text-xs text-dc-text-muted">
          {acceptOverride
            ? `Accepts: ${Object.keys(acceptOverride).join(', ')}`
            : 'Supports: Images (JPEG, PNG, GIF, WebP) and Videos (MP4, WebM, MOV, AVI)'}
          <br />
          Maximum file size: 100MB per file
        </p>
      </div>

      {/* File Rejections */}
      {fileRejections.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <h4 className="font-medium text-red-800">Some files were rejected:</h4>
          </div>
          <ul className="text-sm text-red-600 space-y-1">
            {fileRejections.map(({ file, errors }) => (
              <li key={file.name}>
                {file.name}: {errors.map(e => e.message).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
