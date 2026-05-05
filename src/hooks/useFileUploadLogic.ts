
import { useState, useCallback } from 'react';
import { validateFile, generateFileHash, compressImage } from '@/lib/fileUtils';
import { useCreateFileUpload } from '@/hooks/useFileOperations';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFileUploadNotification } from '@/hooks/useFileUploadNotification';
import type { FileUploadProgress } from '@/types/files';

interface UseFileUploadLogicProps {
  bucketName: string;
  campaignId?: string;
  category?: string;
  onUploadComplete?: (files: any[]) => void;
}

export const useFileUploadLogic = ({
  bucketName,
  campaignId,
  category = 'general',
  onUploadComplete
}: UseFileUploadLogicProps) => {
  const { user } = useAuth();
  const [uploadQueue, setUploadQueue] = useState<FileUploadProgress[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const createFileUpload = useCreateFileUpload();
  const { notifyFileUpload } = useFileUploadNotification();

  const processFileUpload = useCallback(async (acceptedFiles: File[]) => {
    setValidationErrors([]);
    
    // Validate files
    const validFiles: File[] = [];
    const errors: string[] = [];
    
    for (const file of acceptedFiles) {
      const validation = validateFile(file);
      if (validation.isValid) {
        validFiles.push(file);
      } else {
        errors.push(`${file.name}: ${validation.errors.join(', ')}`);
      }
    }
    
    if (errors.length > 0) {
      setValidationErrors(errors);
    }
    
    if (validFiles.length === 0) return;
    
    // Initialize upload queue
    const initialQueue = validFiles.map(file => ({
      fileId: `temp-${Date.now()}-${Math.random()}`,
      progress: 0,
      status: 'pending' as const,
      filename: file.name
    }));
    
    setUploadQueue(initialQueue);
    
    // Process uploads
    const uploadResults = [];
    
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const queueItem = initialQueue[i];
      
      try {
        // Update status to uploading
        setUploadQueue(prev => prev.map(item => 
          item.fileId === queueItem.fileId 
            ? { ...item, status: 'uploading' }
            : item
        ));
        
        // Compress images if needed
        let processedFile = file;
        if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) {
          setUploadQueue(prev => prev.map(item => 
            item.fileId === queueItem.fileId 
              ? { ...item, status: 'processing' }
              : item
          ));
          processedFile = await compressImage(file, 0.8);
        }
        
        // Generate file hash
        const fileHash = await generateFileHash(processedFile);
        
        // Create unique filename
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const extension = processedFile.name.split('.').pop();
        const filename = `${timestamp}-${randomString}.${extension}`;
        const filePath = user ? `${user.id}/${filename}` : filename;
        
        // Simulate upload progress
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress += Math.random() * 30;
          if (progress > 90) progress = 90;
          setUploadQueue(prev => prev.map(item => 
            item.fileId === queueItem.fileId 
              ? { ...item, progress }
              : item
          ));
        }, 100);
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, processedFile);
        
        clearInterval(progressInterval);
        
        if (uploadError) {
          throw uploadError;
        }
        
        // Create database record
        const fileRecord = await createFileUpload.mutateAsync({
          filename,
          original_filename: file.name,
          file_path: uploadData.path,
          bucket_name: bucketName,
          file_size: processedFile.size,
          mime_type: processedFile.type,
          file_hash: fileHash,
          campaign_id: campaignId,
          file_category: category,
          is_compressed: processedFile !== file,
          compression_ratio: processedFile !== file ? (file.size - processedFile.size) / file.size : undefined,
          metadata: {
            original_size: file.size,
            processed_size: processedFile.size
          }
        });
        
        uploadResults.push(fileRecord);
        
        // Update status to completed
        setUploadQueue(prev => prev.map(item => 
          item.fileId === queueItem.fileId 
            ? { ...item, status: 'completed', progress: 100 }
            : item
        ));
        
      } catch (error) {
        console.error('Upload error:', error);
        setUploadQueue(prev => prev.map(item => 
          item.fileId === queueItem.fileId 
            ? { ...item, status: 'failed', error: error instanceof Error ? error.message : 'Upload failed' }
            : item
        ));
      }
    }
    
    // Keep completed uploads visible for longer, clear failed ones
    setTimeout(() => {
      setUploadQueue(prev => prev.filter(item => item.status === 'completed'));
    }, 1000);
    
    // Clear all after 10 seconds
    setTimeout(() => {
      setUploadQueue([]);
    }, 10000);
    
    if (onUploadComplete && uploadResults.length > 0) {
      onUploadComplete(uploadResults);
    }

    // Send notification if this is a campaign upload
    if (campaignId && uploadResults.length > 0 && user) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        
        const uploaderRole = profile?.role === 'content_creator' ? 'creator' : 'restaurant';
        
        await notifyFileUpload(
          campaignId,
          'Campaign',
          uploadResults.length,
          uploaderRole
        );
      } catch (error) {
        console.error('Failed to send file upload notification:', error);
      }
    }
  }, [bucketName, campaignId, category, user, createFileUpload, onUploadComplete, notifyFileUpload]);

  const removeFromQueue = useCallback((fileId: string) => {
    setUploadQueue(prev => prev.filter(item => item.fileId !== fileId));
  }, []);

  return {
    uploadQueue,
    validationErrors,
    processFileUpload,
    removeFromQueue
  };
};
