import React, { useState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Upload, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  uploadProfileAsset,
  UploadError,
} from '@/lib/storage/uploadProfileAsset';

interface AvatarUploadProps {
  avatarFile: File | null;
  onAvatarFileChange: (file: File | null) => void;
  avatarUrl?: string;
  onAvatarUrlChange?: (url: string) => void;
}

export const AvatarUpload = ({
  avatarFile,
  onAvatarFileChange,
  avatarUrl,
  onAvatarUrlChange,
}: AvatarUploadProps) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const { url } = await uploadProfileAsset({
        file,
        userId: user.id,
        kind: 'avatar',
      });
      onAvatarFileChange(file);
      setLocalPreview(URL.createObjectURL(file));
      onAvatarUrlChange?.(url);
      toast({ title: 'Profile photo uploaded \u2713' });
    } catch (err) {
      const msg = err instanceof UploadError ? err.message : 'Upload failed.';
      toast({
        title: "Couldn't upload profile photo",
        description: `${msg} Try a smaller file or a different format.`,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const previewSrc = localPreview || avatarUrl;

  return (
    <div>
      <Label>Profile Picture</Label>
      {previewSrc ? (
        <div className="mt-2 flex items-start gap-3">
          <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-dc-teal flex-shrink-0">
            <img
              src={previewSrc}
              alt="Avatar preview"
              className="w-full h-full object-cover"
            />
            <span
              className="absolute top-0 right-0"
              aria-label="Uploaded successfully"
            >
              <CheckCircle className="w-4 h-4 text-dc-teal drop-shadow" />
            </span>
          </div>
          <div className="min-w-0 pt-2">
            <p className="text-sm text-gray-700 truncate">
              {avatarFile
                ? avatarFile.name.length > 24
                  ? avatarFile.name.slice(0, 21) + '...'
                  : avatarFile.name
                : 'Profile photo'}
            </p>
            <button
              type="button"
              className="text-sm text-dc-teal hover:underline mt-1"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <div
          className="mt-2 border-2 border-dashed border-dc-teal rounded-lg p-6 text-center cursor-pointer hover:bg-teal-50/30 transition-colors"
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        >
          <Upload className="mx-auto h-10 w-10 text-dc-teal mb-2" />
          <p className="text-sm font-medium text-gray-700">
            {uploading ? 'Uploading...' : 'Upload your profile picture'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            JPG, PNG, WebP up to 10MB
          </p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />
    </div>
  );
};
