
import React from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { useDropzone, FileRejection } from 'react-dropzone';

interface FileUploadDropzoneProps {
  onDrop: (acceptedFiles: File[], fileRejections: FileRejection[]) => void;
  acceptedFiles: File[];
  fileRejections: FileRejection[];
}

const FileUploadDropzone: React.FC<FileUploadDropzoneProps> = ({
  onDrop,
  fileRejections
}) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles, fileRejections) => {
      console.log('Files dropped:', {
        acceptedCount: acceptedFiles.length,
        rejectedCount: fileRejections.length,
        acceptedFiles: acceptedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
        rejections: fileRejections.map(r => ({ name: r.file.name, errors: r.errors.map(e => e.message) }))
      });
      
      // Convert FileWithPath[] to File[] by spreading into new array
      const files = [...acceptedFiles] as File[];
      onDrop(files, fileRejections);
    },
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
      'video/*': ['.mp4', '.webm', '.mov', '.avi']
    },
    maxSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 10
  });

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium text-gray-700 mb-2">
          {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
        </p>
        <p className="text-sm text-gray-500 mb-4">
          or click to select files
        </p>
        <p className="text-xs text-gray-400">
          Supports: Images (JPEG, PNG, GIF, WebP) and Videos (MP4, WebM, MOV, AVI)
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

export default FileUploadDropzone;
