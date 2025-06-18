
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreateFileUpload } from '@/hooks/useFileUploadMutations';
import { toast } from '@/hooks/use-toast';

interface UseProjectFileUploadProps {
  campaignId: string;
  campaignTitle: string;
  onUploadComplete?: () => void;
}

export const useProjectFileUpload = ({
  campaignId,
  campaignTitle,
  onUploadComplete
}: UseProjectFileUploadProps) => {
  const { user } = useAuth();
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [isUploading, setIsUploading] = useState(false);
  const createFileUpload = useCreateFileUpload();

  const handleUpload = async (acceptedFiles: File[]) => {
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
      campaignId,
      userRole: user.user_metadata?.role || 'unknown'
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
          bucketName: 'campaign-deliverables',
          fileSize: file.size,
          mimeType: file.type
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

        // Create database record with enhanced error handling
        console.log('Creating database record...');
        try {
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
        } catch (dbError) {
          console.error('Database record creation failed:', dbError);
          
          // Clean up the uploaded file from storage if database insert fails
          try {
            await supabase.storage
              .from('campaign-deliverables')
              .remove([uploadData.path]);
            console.log('Cleaned up storage file after database error');
          } catch (cleanupError) {
            console.error('Failed to cleanup storage file:', cleanupError);
          }
          
          throw new Error(`Database error: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`);
        }
      }

      toast({
        title: 'Files uploaded successfully',
        description: `${acceptedFiles.length} file(s) uploaded to ${campaignTitle}`,
      });

      console.log('=== UPLOAD PROCESS COMPLETED SUCCESSFULLY ===');
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
        } else if (error.message.includes('Database error')) {
          errorMessage = error.message;
        } else {
          errorMessage = `Upload failed: ${error.message}`;
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

  return {
    uploadProgress,
    isUploading,
    handleUpload
  };
};
