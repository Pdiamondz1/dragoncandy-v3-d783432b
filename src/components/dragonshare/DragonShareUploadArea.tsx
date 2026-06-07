// src/components/dragonshare/DragonShareUploadArea.tsx
import { Upload, Camera as CameraIcon, X, Loader2 } from 'lucide-react';
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';
import { useNativePlatform } from '@/hooks/use-native-platform';
import type { useDragonShareSubmitForm } from '@/hooks/useDragonShareSubmitForm';

interface Props {
  form: ReturnType<typeof useDragonShareSubmitForm>;
}

const DASH =
  'border-2 border-dashed border-dc-teal/30 rounded-2xl text-center hover:border-dc-teal/60 transition-colors bg-dc-teal/5';

export function DragonShareUploadArea({ form }: Props) {
  const { isNative } = useNativePlatform();

  return (
    <div>
      <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
        Content
      </label>
      <input
        ref={form.fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={form.handleFileSelect}
      />

      {form.uploadedUrl ? (
        <div className="border border-dc-teal/30 rounded-2xl overflow-hidden bg-dc-teal/5">
          {form.uploadedFileType?.startsWith('video/') ? (
            <div className="h-32 w-full overflow-hidden">
              <VideoThumbnail src={form.uploadedUrl} className="w-full h-full object-cover" />
            </div>
          ) : (
            <img src={form.uploadedUrl} alt="Upload preview" className="h-32 w-full object-cover" />
          )}
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-dc-teal font-medium truncate">✓ {form.uploadedFileName}</span>
            <button onClick={form.removeUpload} className="text-dc-text-muted hover:text-dc-text">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : isNative ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={form.captureFromCamera} disabled={form.uploading} className={`${DASH} p-5`}>
            <CameraIcon className="h-7 w-7 mx-auto text-dc-teal mb-1.5" />
            <p className="font-semibold text-xs text-dc-text">Take photo</p>
          </button>
          <button onClick={() => form.fileInputRef.current?.click()} disabled={form.uploading} className={`${DASH} p-5`}>
            {form.uploading ? (
              <Loader2 className="h-7 w-7 mx-auto text-dc-teal animate-spin mb-1.5" />
            ) : (
              <Upload className="h-7 w-7 mx-auto text-dc-teal mb-1.5" />
            )}
            <p className="font-semibold text-xs text-dc-text">Choose photo or video</p>
          </button>
        </div>
      ) : (
        <button onClick={() => form.fileInputRef.current?.click()} disabled={form.uploading} className={`${DASH} w-full p-6`}>
          {form.uploading ? (
            <Loader2 className="h-8 w-8 mx-auto text-dc-teal animate-spin mb-2" />
          ) : (
            <Upload className="h-8 w-8 mx-auto text-dc-teal mb-2" />
          )}
          <p className="font-semibold text-sm text-dc-text">
            {form.uploading ? 'Uploading...' : 'Tap to upload photo or video'}
          </p>
          <p className="text-xs text-dc-text-muted mt-1">from your camera roll or files</p>
        </button>
      )}
    </div>
  );
}
