import React, { useState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Upload, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  uploadProfileAsset,
  UploadError,
} from '@/lib/storage/uploadProfileAsset';
import { CurrentPortfolioDisplay } from './CurrentPortfolioDisplay';

interface PortfolioUploadProps {
  portfolioPaths: string[];
  onPortfolioPathsChange: (paths: string[]) => void;
}

export const PortfolioUpload = ({
  portfolioPaths,
  onPortfolioPathsChange,
}: PortfolioUploadProps) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [newPreviews, setNewPreviews] = useState<
    { url: string; name: string }[]
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleRemoveItem = (pathToRemove: string) => {
    onPortfolioPathsChange(portfolioPaths.filter((p) => p !== pathToRemove));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !user) return;

    const fileList = Array.from(files);
    setUploading(true);
    setProgress({ done: 0, total: fileList.length });

    const newPaths: string[] = [];
    const previews: { url: string; name: string }[] = [...newPreviews];
    let completed = 0;

    for (const file of fileList) {
      try {
        const { path } = await uploadProfileAsset({
          file,
          userId: user.id,
          kind: 'portfolio',
        });
        newPaths.push(path);
        previews.push({ url: URL.createObjectURL(file), name: file.name });
        completed++;
        setProgress({ done: completed, total: fileList.length });
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

    setUploading(false);

    if (completed > 0) {
      onPortfolioPathsChange([...portfolioPaths, ...newPaths]);
      setNewPreviews(previews);
      toast({
        title: `${completed} sample file${completed !== 1 ? 's' : ''} uploaded \u2713`,
      });
    }
  };

  const truncateName = (name: string) =>
    name.length > 24 ? name.slice(0, 21) + '...' : name;

  return (
    <div>
      <Label>Portfolio</Label>

      {/* Display current portfolio items */}
      <div className="mt-2">
        <CurrentPortfolioDisplay
          portfolioPaths={portfolioPaths}
          onRemoveItem={handleRemoveItem}
        />
      </div>

      {/* Upload new items */}
      <div className="mt-4">
        <Label className="text-sm text-muted-foreground">Add New Items</Label>
        <div
          className="mt-2 border-2 border-dashed border-[#4DD9C0] rounded-lg p-6 text-center cursor-pointer hover:bg-teal-50/30 transition-colors"
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        >
          <Upload className="mx-auto h-10 w-10 text-[#4DD9C0] mb-2" />
          <p className="text-sm font-medium text-gray-700">
            {uploading
              ? `Uploading ${progress.done} of ${progress.total}...`
              : 'Upload portfolio content'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            JPG, PNG, MP4, MOV up to 50MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />

        {/* Newly-uploaded thumbnails */}
        {newPreviews.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {newPreviews.map((item, idx) => (
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
    </div>
  );
};
