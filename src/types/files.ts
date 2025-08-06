
export interface FileUpload {
  id: string;
  filename: string;
  original_filename: string;
  file_path: string;
  bucket_name: string;
  file_size: number;
  mime_type: string;
  file_hash: string | null;
  upload_status: 'pending' | 'uploading' | 'completed' | 'failed';
  uploaded_by: string;
  campaign_id: string | null;
  file_category: string;
  metadata: Record<string, any>;
  is_public: boolean;
  is_compressed: boolean;
  compression_ratio: number | null;
  created_at: string;
  updated_at: string;
  uploader_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  versions?: FileVersion[];
  comments?: FileComment[];
  tags?: FileTag[];
  permissions?: FilePermission[];
}

export interface FileVersion {
  id: string;
  file_upload_id: string;
  version_number: number;
  file_path: string;
  file_size: number;
  changes_description: string | null;
  created_by: string;
  created_at: string;
  creator_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface FilePermission {
  id: string;
  file_upload_id: string;
  user_id: string | null;
  permission_type: 'view' | 'download' | 'edit' | 'delete' | 'share';
  granted_by: string;
  expires_at: string | null;
  created_at: string;
  user_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface FileComment {
  id: string;
  file_upload_id: string;
  user_id: string;
  comment_text: string;
  annotation_data: Record<string, any> | null;
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
  user_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  replies?: FileComment[];
}

export interface FileTag {
  id: string;
  name: string;
  color: string;
  created_by: string;
  created_at: string;
}

export interface FileUploadProgress {
  fileId: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
  filename?: string;
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BulkOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
}
