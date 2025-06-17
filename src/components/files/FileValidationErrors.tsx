
import React from 'react';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface FileValidationErrorsProps {
  errors: string[];
}

const FileValidationErrors: React.FC<FileValidationErrorsProps> = ({ errors }) => {
  if (errors.length === 0) return null;

  return (
    <Card className="mt-4 p-4 border-red-200 bg-red-50">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium text-red-800 mb-2">Upload Errors</h4>
          <ul className="text-sm text-red-700 space-y-1">
            {errors.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
};

export default FileValidationErrors;
