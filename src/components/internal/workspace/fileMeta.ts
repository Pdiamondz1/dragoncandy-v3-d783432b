import { File, FileSpreadsheet, FileText, Film, Image, Presentation, type LucideIcon } from 'lucide-react';

interface FileMeta {
  icon: LucideIcon;
  label: string;
}

const GOOGLE_KINDS: Record<string, FileMeta> = {
  'application/vnd.google-apps.document': { icon: FileText, label: 'Doc' },
  'application/vnd.google-apps.spreadsheet': { icon: FileSpreadsheet, label: 'Sheet' },
  'application/vnd.google-apps.presentation': { icon: Presentation, label: 'Slides' },
};

export function fileMeta(mimeType: string): FileMeta {
  if (GOOGLE_KINDS[mimeType]) return GOOGLE_KINDS[mimeType];
  if (mimeType.startsWith('image/')) return { icon: Image, label: 'Image' };
  if (mimeType.startsWith('video/')) return { icon: Film, label: 'Video' };
  return { icon: File, label: 'File' };
}

export function previewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}
