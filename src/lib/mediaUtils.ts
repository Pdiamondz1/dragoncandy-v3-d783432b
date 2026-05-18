const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv'];

export type MediaType = 'Photo' | 'Reel' | null;

export interface ResolvedPortfolioItem {
  url: string;
  type: MediaType;
}

export function getMediaType(input: string): MediaType {
  if (!input) return null;

  let pathname: string;
  try {
    pathname = input.startsWith('http') ? new URL(input).pathname : input;
  } catch {
    pathname = input;
  }

  const ext = pathname.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  if (IMAGE_EXTENSIONS.includes(ext)) return 'Photo';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'Reel';
  return null;
}
