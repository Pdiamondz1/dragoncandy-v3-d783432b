
import { useDropzone } from 'react-dropzone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface FileUploadDropzoneProps {
  maxFiles: number;
  acceptedTypes?: string[];
  onDrop: (files: File[]) => void;
  className?: string;
}

const FileUploadDropzone: React.FC<FileUploadDropzoneProps> = ({
  maxFiles,
  acceptedTypes,
  onDrop,
  className = ''
}) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept: acceptedTypes ? Object.fromEntries(acceptedTypes.map(type => [type, []])) : undefined
  });

  return (
    <div className={className}>
      <Card
        {...getRootProps()}
        className={`p-8 border-2 border-dashed cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-border hover:border-border'
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-center">
          <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">
            {isDragActive ? 'Drop files here' : 'Upload files'}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Drag and drop files here, or click to select files
          </p>
          <Button type="button" variant="outline">
            Choose Files
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default FileUploadDropzone;
