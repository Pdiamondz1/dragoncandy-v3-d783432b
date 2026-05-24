
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreateFileUpload } from '@/hooks/useFileUploadMutations';
import { useFileUploadNotification } from '@/hooks/useFileUploadNotification';
import { toast } from '@/hooks/use-toast';
import { useVideoProcessing } from '@/hooks/useVideoProcessing';
import { extractThumbnail } from '@/lib/videoProcessing';

interface UseProjectFileUploadProps {
  campaignId: string;
  campaignTitle: string;
  deliverableId?: string;
  onUploadComplete?: () => void;
}

export const useProjectFileUpload = ({
  campaignId,
  campaignTitle,
  deliverableId,
  onUploadComplete
}: UseProjectFileUploadProps) => {
  const { user } = useAuth();
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [uploadStatus, setUploadStatus] = useState<{[key: string]: string}>({});
  const [isUploading, setIsUploading] = useState(false);
  const createFileUpload = useCreateFileUpload();
  const { notifyFileUpload } = useFileUploadNotification();
  const { processVideo, reset: resetVideoProcessing } = useVideoProcessing();

  const handleUpload = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0 || !user) {
      console.error('Upload conditions not met:', {
        filesCount: acceptedFiles.length,
        user: !!user
      });
      return;
    }

    setIsUploading(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        throw new Error('Authentication required. Please sign in again.');
      }

      // Determine uploader role BEFORE uploading — fail early if profile unreadable
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Could not determine your account role. Please refresh and try again.');
      }
      const uploaderRole = profile.role === 'content_creator' ? 'creator' : 'restaurant';

      const uploadedFiles = [];

      for (const file of acceptedFiles) {
        setUploadProgress(prev => ({ ...prev, [file.name]: 5 }));

        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const extension = file.name.split('.').pop();
        const isVideo = file.type.startsWith('video/');

        let fileToUpload: File | Blob = file;
        let thumbnailBlob: Blob | null = null;
        let wasTranscoded = false;

        if (isVideo) {
          try {
            resetVideoProcessing();
            setUploadStatus(prev => ({ ...prev, [file.name]: 'Processing video…' }));
            const result = await processVideo(file);
            fileToUpload = result.videoFile;
            thumbnailBlob = result.thumbnail;
            wasTranscoded = result.wasTranscoded;
          } catch (err) {
            console.warn('Video processing failed, uploading original:', err);
            setUploadStatus(prev => ({ ...prev, [file.name]: 'Uploading original…' }));
            try { thumbnailBlob = await extractThumbnail(file); } catch { /* best-effort */ }
          }
        }

        const actualExtension = wasTranscoded ? 'mp4' : extension;
        const actualFilename = `${timestamp}-${randomString}.${actualExtension}`;
        const actualFilePath = `${user.id}/${actualFilename}`;
        const actualMimeType = wasTranscoded ? 'video/mp4' : file.type;

        setUploadProgress(prev => ({ ...prev, [file.name]: 30 }));
        setUploadStatus(prev => ({ ...prev, [file.name]: 'Uploading…' }));

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('campaign-deliverables')
          .upload(actualFilePath, fileToUpload, {
            cacheControl: '3600',
            upsert: false,
            contentType: actualMimeType,
          });

        if (uploadError) {
          console.error('Storage upload failed:', uploadError);
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        setUploadProgress(prev => ({ ...prev, [file.name]: 70 }));

        let thumbnailPath: string | null = null;
        if (thumbnailBlob) {
          const thumbPath = `${user.id}/thumbs/${timestamp}-${randomString}.jpg`;
          const { error: thumbErr } = await supabase.storage
            .from('campaign-deliverables')
            .upload(thumbPath, thumbnailBlob, { contentType: 'image/jpeg', cacheControl: '86400' });
          if (!thumbErr) thumbnailPath = thumbPath;
        }

        try {
          const fileRecord = await createFileUpload.mutateAsync({
            filename: actualFilename,
            original_filename: file.name,
            file_path: uploadData.path,
            bucket_name: 'campaign-deliverables',
            file_size: fileToUpload.size,
            mime_type: actualMimeType,
            campaign_id: campaignId,
            file_category: 'deliverable',
            metadata: {
              campaign_title: campaignTitle,
              upload_type: 'deliverable',
              campaign_id: campaignId,
              uploaded_at: new Date().toISOString(),
              ...(deliverableId && { deliverable_id: deliverableId }),
              ...(thumbnailPath && { thumbnail_path: thumbnailPath }),
              ...(wasTranscoded && {
                transcoded: true,
                original_extension: extension,
                original_mime_type: file.type,
              }),
            }
          });

          uploadedFiles.push(fileRecord);
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
        } catch (dbError) {
          console.error('Database record creation failed:', dbError);

          const pathsToRemove = [uploadData.path];
          if (thumbnailPath) pathsToRemove.push(thumbnailPath);
          try {
            await supabase.storage.from('campaign-deliverables').remove(pathsToRemove);
          } catch (cleanupError) {
            console.error('Failed to cleanup storage files:', cleanupError);
          }

          throw new Error(`Database error: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`);
        }
      }

      toast({
        title: 'Files uploaded successfully',
        description: `${acceptedFiles.length} file(s) uploaded to ${campaignTitle}`,
      });

      try {
        await notifyFileUpload(
          campaignId,
          campaignTitle,
          uploadedFiles.length,
          uploaderRole
        );
      } catch (error) {
        console.error('Failed to send file upload notification:', error);
      }

      if (onUploadComplete) onUploadComplete();

    } catch (error) {
      console.error('Upload failed:', error);

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
      setUploadStatus({});
      resetVideoProcessing();
    }
  };

  return {
    uploadProgress,
    uploadStatus,
    isUploading,
    handleUpload
  };
};
