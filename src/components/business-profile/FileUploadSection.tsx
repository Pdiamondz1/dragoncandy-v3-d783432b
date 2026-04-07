import React, { useState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Upload, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  uploadProfileAsset,
  UploadError,
  type ProfileAssetKind,
} from '@/lib/storage/uploadProfileAsset';

interface FileUploadSectionProps {
  logoFile: File | null;
  sampleFiles: File[];
  onLogoChange: (file: File | null) => void;
  onSampleFilesChange: (files: File[]) => void;
  logoUrl?: string;
  sampleUrls?: string[];
  onLogoUrlChange?: (url: string) => void;
  onSampleUrlsChange?: (urls: string[]) => void;
}

export const FileUploadSection = ({
  logoFile,
  sampleFiles,
  onLogoChange,
  onSampleFilesChange,
  logoUrl,
  sampleUrls = [],
  onLogoUrlChange,
  onSampleUrlsChange,
}: FileUploadSectionProps) => {
  const { user } = useAuth();
  const [logoUploading, setLogoUploading] = useState(false);
  const [sampleUploading, setSampleUploading] = useState(false);
  const [sampleProgress, setSampleProgress] = useState({ done: 0, total: 0 });
  const [localLogoPreview, setLocalLogoPreview] = useState<string | null>(null);
  const [localSamplePreviews, setLocalSamplePreviews] = useState<
    { url: string; name: string }[]
  >([]);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const sampleInputRef = useRef<HTMLInputElement>(null);

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setLogoUploading(true);
    try {
      const { url } = await uploadProfileAsset({
        file,
        userId: user.id,
        kind: 'logo',
      });
      onLogoChange(file);
      setLocalLogoPreview(URL.createObjectURL(file));
      onLogoUrlChange?.(url);
      toast({ title: 'Logo uploaded \u2713' });
    } catch (err) {
      const msg =
        err instanceof UploadError ? err.message : 'Upload failed.';
      toast({
        title: "Couldn't upload logo",
        description: `${msg} Try a smaller file or a different format.`,
        variant: 'destructive',
      });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSampleSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files?.length || !user) return;

    const fileList = Array.from(files);
    setSampleUploading(true);
    setSampleProgress({ done: 0, total: fileList.length });

    const uploadedUrls: string[] = [...sampleUrls];
    const previews: { url: string; name: string }[] = [...localSamplePreviews];
    let completed = 0;

    for (const file of fileList) {
      try {
        const { url } = await uploadProfileAsset({
          file,
          userId: user.id,
          kind: 'sample',
        });
        uploadedUrls.push(url);
        previews.push({ url: URL.createObjectURL(file), name: file.name });
        completed++;
        setSampleProgress({ done: completed, total: fileList.length });
      } catch (err) {
        const msg =
          err instanceof UploadError ? err.message : 'Upload failed.';
        toast({
          title: `Couldn't upload ${file.name}`,
          description: `${msg} Try a smaller file or a different format.`,
          variant: 'destructive',
        });
      }
    }

    setSampleUploading(false);

    if (completed > 0) {
      onSampleFilesChange([...sampleFiles, ...fileList.slice(0, completed)]);
      setLocalSamplePreviews(previews);
      onSampleUrlsChange?.(uploadedUrls);
      toast({ title: `${completed} sample file${completed !== 1 ? 's' : ''} uploaded \u2713` });
    }
  };

  const truncateName = (name: string) =>
    name.length > 24 ? name.slice(0, 21) + '...' : name;

  const logoPreviewSrc = localLogoPreview || logoUrl;

  return (
    <>
      {/* Logo Upload */}
      <div>
        <Label>Business Logo</Label>
        {logoPreviewSrc ? (
          <div className="mt-2 flex items-start gap-3">
            <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
              <img
                src={logoPreviewSrc}
                alt="Logo preview"
                className="w-full h-full object-cover"
              />
              <span
                className="absolute top-1 right-1"
                aria-label="Uploaded successfully"
              >
                <CheckCircle className="w-4 h-4 text-[#4DD9C0] drop-shadow" />
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-gray-700 truncate">
                {logoFile ? truncateName(logoFile.name) : 'Logo'}
              </p>
              <button
                type="button"
                className="text-sm text-[#4DD9C0] hover:underline mt-1"
                onClick={() => logoInputRef.current?.click()}
              >
                Replace
              </button>
            </div>
          </div>
        ) : (
          <div
            className="mt-2 border-2 border-dashed border-[#4DD9C0] rounded-lg p-6 text-center cursor-pointer hover:bg-teal-50/30 transition-colors"
            onClick={() => logoInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && logoInputRef.current?.click()}
          >
            <Upload className="mx-auto h-10 w-10 text-[#4DD9C0] mb-2" />
            <p className="text-sm font-medium text-gray-700">
              {logoUploading ? 'Uploading...' : 'Upload your business logo'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              JPG, PNG, WebP up to 10MB
            </p>
          </div>
        )}
        <input
          ref={logoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleLogoSelect}
          className="hidden"
          disabled={logoUploading}
        />
      </div>

      {/* Sample Content Upload */}
      <div>
        <Label>Sample / Preferred Content</Label>
        <div
          className="mt-2 border-2 border-dashed border-[#4DD9C0] rounded-lg p-6 text-center cursor-pointer hover:bg-teal-50/30 transition-colors"
          onClick={() => sampleInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && sampleInputRef.current?.click()}
        >
          <Upload className="mx-auto h-10 w-10 text-[#4DD9C0] mb-2" />
          <p className="text-sm font-medium text-gray-700">
            {sampleUploading
              ? `Uploading ${sampleProgress.done} of ${sampleProgress.total}...`
              : 'Upload sample or preferred content'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            JPG, PNG, MP4, MOV up to 50MB
          </p>
        </div>
        <input
          ref={sampleInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
          multiple
          onChange={handleSampleSelect}
          className="hidden"
          disabled={sampleUploading}
        />

        {/* Thumbnail grid */}
        {localSamplePreviews.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {localSamplePreviews.map((item, idx) => (
              <div
                key={idx}
                className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
              >
                <img
                  src={item.url}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
                <span
                  className="absolute top-1 right-1"
                  aria-label="Uploaded successfully"
                >
                  <CheckCircle className="w-4 h-4 text-[#4DD9C0] drop-shadow" />
                </span>
                <p className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
                  {truncateName(item.name)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
