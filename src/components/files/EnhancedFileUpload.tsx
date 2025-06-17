
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, File, X, Check, AlertCircle } from 'lucide-react';
import { validateFile, formatFileSize, generateFileHash, compressImage } from '@/lib/fileUtils';
import { useCreateFileUpload } from '@/hooks/useFileOperations';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { FileUploadProgress } from '@/types/files';

interface EnhancedFileUploadProps {
  bucketName: string;
  campaignId?: string;
  category?: string;
  maxFiles?: number;
  acceptedTypes?: string[];
  onUploadComplete?: (files: any[]) => void;
  className?: string;
}

const EnhancedFileUpload: React.FC<EnhancedFileUploadProps> = ({
  bucketName,
  campaignId,
  category = 'general',
  maxFiles = 10,
  acceptedTypes,
  onUploadComplete,
  className = ''
}) => {
  const { user } = useAuth();
  const [uploadQueue, setUploadQueue] = useState<FileUploadProgress[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const createFileUpload = useCreateFileUpload();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
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
      status: 'pending' as const
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
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, processedFile, {
            onUploadProgress: (progress) => {
              const percentage = (progress.loaded / progress.total) * 100;
              setUploadQueue(prev => prev.map(item => 
                item.fileId === queueItem.fileId 
                  ? { ...item, progress: percentage }
                  : item
              ));
            }
          });
        
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
          compression_ratio: processedFile !== file ? (file.size - processedFile.size) / file.size : null,
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
    
    // Clear queue after 3 seconds
    setTimeout(() => {
      setUploadQueue([]);
    }, 3000);
    
    if (onUploadComplete && uploadResults.length > 0) {
      onUploadComplete(uploadResults);
    }
  }, [bucketName, campaignId, category, user, createFileUpload, onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept: acceptedTypes ? Object.fromEntries(acceptedTypes.map(type => [type, []])) : undefined
  });

  const removeFromQueue = (fileId: string) => {
    setUploadQueue(prev => prev.filter(item => item.fileId !== fileId));
  };

  return (
    <div className={className}>
      <Card
        {...getRootProps()}
        className={`p-8 border-2 border-dashed cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-2">
            {isDragActive ? 'Drop files here' : 'Upload files'}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Drag and drop files here, or click to select files
          </p>
          <Button type="button" variant="outline">
            Choose Files
          </Button>
        </div>
      </Card>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Card className="mt-4 p-4 border-red-200 bg-red-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-red-800 mb-2">Upload Errors</h4>
              <ul className="text-sm text-red-700 space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Upload Queue */}
      {uploadQueue.length > 0 && (
        <Card className="mt-4 p-4">
          <h4 className="font-medium mb-4">Upload Progress</h4>
          <div className="space-y-3">
            {uploadQueue.map((item) => (
              <div key={item.fileId} className="flex items-center gap-3">
                <File className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      File {uploadQueue.indexOf(item) + 1}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={
                          item.status === 'completed' ? 'default' :
                          item.status === 'failed' ? 'destructive' : 'secondary'
                        }
                      >
                        {item.status}
                      </Badge>
                      {item.status === 'completed' && (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                      {item.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFromQueue(item.fileId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {item.status !== 'failed' && (
                    <Progress value={item.progress} className="h-2" />
                  )}
                  {item.error && (
                    <p className="text-xs text-red-600 mt-1">{item.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default EnhancedFileUpload;
