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

const IMAGE_MAGIC: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

const VIDEO_MAGIC: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'video/mp4', bytes: [0x00, 0x00, 0x00] },
];

async function validateMagicBytes(file: File, allowedMimes: string[]): Promise<boolean> {
  const buffer = await file.slice(0, 16).arrayBuffer();
  const header = new Uint8Array(buffer);
  const allMagic = [...IMAGE_MAGIC, ...VIDEO_MAGIC].filter(m => allowedMimes.includes(m.mime));
  return allMagic.some(({ bytes }) =>
    bytes.every((b, i) => header[i] === b)
  );
}

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

  // Reject empty files — a 0-byte upload yields a broken image that silently fails to render.
  if (file.size === 0) {
    throw new UploadError('File is empty. Please choose a valid image.');
  }

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

  // Validate extension
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const ALLOWED_EXTENSIONS = isPortfolioKind
    ? ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov']
    : ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new UploadError(`File extension .${ext} is not allowed.`);
  }

  // Validate magic bytes match declared MIME type
  const magicValid = await validateMagicBytes(file, allowedTypes);
  if (!magicValid) {
    throw new UploadError('File content does not match its declared type.');
  }
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
