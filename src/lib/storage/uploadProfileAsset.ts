import { supabase } from '@/integrations/supabase/client';

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

const PROFILE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

const PORTFOLIO_MIME_TYPES = [
  ...PROFILE_MIME_TYPES,
  'video/mp4',
  'video/quicktime',
];

const PROFILE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const PORTFOLIO_MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export type ProfileAssetKind =
  | 'avatar'
  | 'logo'
  | 'sample'
  | 'portfolio'
  | 'preferred';

interface UploadProfileAssetParams {
  file: File;
  bucket?: string;
  userId: string;
  kind: ProfileAssetKind;
}

interface UploadProfileAssetResult {
  url: string;
  path: string;
}

export async function uploadProfileAsset({
  file,
  bucket = 'profile-assets',
  userId,
  kind,
}: UploadProfileAssetParams): Promise<UploadProfileAssetResult> {
  // Determine limits based on kind
  const isPortfolioKind = kind === 'portfolio' || kind === 'sample' || kind === 'preferred';
  const allowedTypes = isPortfolioKind ? PORTFOLIO_MIME_TYPES : PROFILE_MIME_TYPES;
  const maxSize = isPortfolioKind ? PORTFOLIO_MAX_SIZE : PROFILE_MAX_SIZE;

  // Validate MIME type
  if (!allowedTypes.includes(file.type)) {
    const label = isPortfolioKind
      ? 'JPG, PNG, WebP, GIF, MP4, or MOV'
      : 'JPG, PNG, WebP, or GIF';
    throw new UploadError(`Unsupported format. Please use ${label}.`);
  }

  // Validate size
  if (file.size > maxSize) {
    const limitMB = maxSize / (1024 * 1024);
    throw new UploadError(`File is too large. Maximum size is ${limitMB}MB.`);
  }

  // Build path: {userId}/{kind}-{timestamp}.{ext}
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    throw new UploadError(uploadError.message);
  }

  return { url: '', path };
}
