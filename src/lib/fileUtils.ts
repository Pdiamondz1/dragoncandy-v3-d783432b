
export const ALLOWED_FILE_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  videos: ['video/mp4', 'video/webm', 'video/quicktime', 'video/avi'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  spreadsheets: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  archives: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg']
};

export const MAX_FILE_SIZES = {
  image: 10 * 1024 * 1024, // 10MB
  video: 100 * 1024 * 1024, // 100MB
  document: 25 * 1024 * 1024, // 25MB
  audio: 50 * 1024 * 1024, // 50MB
  default: 10 * 1024 * 1024 // 10MB
};

export const validateFile = (file: File): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Check file type
  const allAllowedTypes = Object.values(ALLOWED_FILE_TYPES).flat();
  if (!allAllowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} is not allowed`);
  }
  
  // Check file size
  let maxSize = MAX_FILE_SIZES.default;
  if (file.type.startsWith('image/')) maxSize = MAX_FILE_SIZES.image;
  else if (file.type.startsWith('video/')) maxSize = MAX_FILE_SIZES.video;
  else if (file.type.startsWith('audio/')) maxSize = MAX_FILE_SIZES.audio;
  else if (file.type.includes('pdf') || file.type.includes('document')) maxSize = MAX_FILE_SIZES.document;
  
  if (file.size > maxSize) {
    errors.push(`File size ${formatFileSize(file.size)} exceeds limit of ${formatFileSize(maxSize)}`);
  }
  
  // Check filename
  if (file.name.length > 255) {
    errors.push('Filename is too long (max 255 characters)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileTypeCategory = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'archive';
  return 'other';
};

export const generateFileHash = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const compressImage = async (file: File, quality: number = 0.8): Promise<File> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    
    img.onload = () => {
      // Calculate new dimensions (max 1920x1080)
      let { width, height } = img;
      const maxWidth = 1920;
      const maxHeight = 1080;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        const compressedFile = new File([blob!], file.name, {
          type: file.type,
          lastModified: file.lastModified
        });
        resolve(compressedFile);
      }, file.type, quality);
    };
    
    img.src = URL.createObjectURL(file);
  });
};
