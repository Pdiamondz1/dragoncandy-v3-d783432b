
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, X, File, Image, Video, AlertCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreateFileUpload } from '@/hooks/useFileUploadMutations';

interface ProjectFileUploadProps {
  campaignId: string;
  campaignTitle: string;
  onUploadComplete?: () => void;
}

const ProjectFileUpload: React.FC<ProjectFileUploadProps> = ({
  campaignId,
  campaignTitle,
  onUploadComplete
}) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [isUploading, setIsUploading] = useState(false);
  const createFileUpload = useCreateFileUpload();

  const { getRootProps, getInputProps, acceptedFiles, isDragActive, fileRejections } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
      'video/*': ['.mp4', '.webm', '.mov', '.avi']
    },
    maxSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 10
  });

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (file.type.startsWith('video/')) return <Video className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleUpload = async () => {
    if (acceptedFiles.length === 0 || !user) {
      console.error('Upload conditions not met:', { 
        filesCount: acceptedFiles.length, 
        user: !!user 
      });
      return;
    }
    
    console.log('=== STARTING UPLOAD PROCESS ===');
    console.log('Upload context:', { 
      fileCount: acceptedFiles.length, 
      userId: user.id, 
      campaignId
    });
    
    setIsUploading(true);
    
    try {
      // Verify authentication before starting
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        throw new Error('Authentication required. Please sign in again.');
      }
      console.log('User authenticated successfully');

      const uploadedFiles = [];
      
      for (const file of acceptedFiles) {
        console.log('Processing file:', { 
          name: file.name, 
          size: file.size, 
          type: file.type 
        });
        
        // Set initial progress
        setUploadProgress(prev => ({ ...prev, [file.name]: 10 }));
        
        // Generate unique filename with user ID folder structure
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const extension = file.name.split('.').pop();
        const filename = `${timestamp}-${randomString}.${extension}`;
        const filePath = `${user.id}/${filename}`;
        
        console.log('Uploading to storage:', {
          filePath,
          bucketName: 'campaign-deliverables'
        });
        
        // Update progress
        setUploadProgress(prev => ({ ...prev, [file.name]: 30 }));
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('campaign-deliverables')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Storage upload failed:', uploadError);
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        console.log('Storage upload successful:', uploadData);
        setUploadProgress(prev => ({ ...prev, [file.name]: 70 }));

        // Create database record
        console.log('Creating database record...');
        const fileRecord = await createFileUpload.mutateAsync({
          filename,
          original_filename: file.name,
          file_path: uploadData.path,
          bucket_name: 'campaign-deliverables',
          file_size: file.size,
          mime_type: file.type,
          campaign_id: campaignId,
          file_category: 'deliverable',
          metadata: {
            campaign_title: campaignTitle,
            upload_type: 'project_deliverable',
            campaign_id: campaignId,
            uploaded_at: new Date().toISOString()
          }
        });

        console.log('Database record created successfully:', fileRecord);
        uploadedFiles.push(fileRecord);
        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      }

      toast({
        title: 'Files uploaded successfully',
        description: `${acceptedFiles.length} file(s) uploaded to ${campaignTitle}`,
      });

      console.log('=== UPLOAD PROCESS COMPLETED SUCCESSFULLY ===');
      setIsOpen(false);
      if (onUploadComplete) onUploadComplete();
      
    } catch (error) {
      console.error('=== UPLOAD PROCESS FAILED ===');
      console.error('Upload error details:', error);
      
      // Provide specific error messages based on error type
      let errorMessage = 'There was an error uploading your files. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('Storage upload failed')) {
          errorMessage = `Storage error: ${error.message}`;
        } else if (error.message.includes('Authentication required')) {
          errorMessage = 'Please sign in again and try uploading.';
        } else if (error.message.includes('violates row-level security')) {
          errorMessage = 'Permission denied. Please check your account permissions.';
        } else if (error.message.includes('duplicate key')) {
          errorMessage = 'A file with this name already exists. Please rename and try again.';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: 'Upload failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress({});
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex-1">
          <Upload className="h-4 w-4 mr-2" />
          Upload Work
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Deliverables for {campaignTitle}</DialogTitle>
        </DialogHeader>
        
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

          {/* Accepted Files */}
          {acceptedFiles.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-700">Files to upload:</h4>
              {acceptedFiles.map((file) => (
                <div key={file.name} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  {getFileIcon(file)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                  {uploadProgress[file.name] !== undefined && (
                    <div className="w-24">
                      <Progress value={uploadProgress[file.name]} className="h-2" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upload Button */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={acceptedFiles.length === 0 || isUploading || !user}
            >
              {isUploading ? 'Uploading...' : `Upload ${acceptedFiles.length} file(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectFileUpload;
