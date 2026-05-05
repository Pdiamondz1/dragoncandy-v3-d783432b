import { EnhancedFileUpload } from '@/components/files/EnhancedFileUpload';

interface ApplicationPortfolioUploadProps {
  portfolioFiles: File[];
  onPortfolioFilesChange: (files: File[]) => void;
}

export const ApplicationPortfolioUpload = ({ portfolioFiles, onPortfolioFilesChange }: ApplicationPortfolioUploadProps) => {
  return (
    <div>
      <EnhancedFileUpload
        bucketName="profile-media"
        category="application-portfolio"
        maxFiles={10}
        acceptedTypes={['image/*', 'video/*']}
        onUploadComplete={(files) => {
          // For applications, we still work with File objects temporarily
          // This will be properly handled by the application submission logic
          const fileObjects = files.map(f => new File([], f.original_filename || f.filename || 'file'));
          onPortfolioFilesChange([...portfolioFiles, ...fileObjects]);
        }}
      />
    </div>
  );
};