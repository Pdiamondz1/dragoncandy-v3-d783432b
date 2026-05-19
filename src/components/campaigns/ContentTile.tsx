import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, RotateCcw, Download, ImageOff } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { VideoFrameThumbnail } from '@/components/content/VideoFrameThumbnail';
import { supabase } from '@/integrations/supabase/client';
import type { GalleryFile } from '@/hooks/useCampaignContentGallery';

interface ContentTileProps {
  file: GalleryFile;
  isSelecting: boolean;
  isSelected: boolean;
  onToggleSelect: (fileId: string) => void;
  onApprove: (file: GalleryFile) => void;
  onRequestRevision: (file: GalleryFile, feedback: string) => void;
  onDownload: (file: GalleryFile) => void;
  onPreview: (file: GalleryFile) => void;
}

const STATUS_CONFIG = {
  approved: { label: 'Approved', bg: 'bg-emerald-100 text-emerald-700', border: 'border-dc-teal' },
  submitted: { label: 'Pending Review', bg: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-400' },
  revision_requested: { label: 'Revision Requested', bg: 'bg-amber-100 text-amber-700', border: 'border-amber-500' },
  not_submitted: { label: 'Not Submitted', bg: 'bg-gray-100 text-gray-500', border: 'border-dashed border-gray-400' },
} as const;

export function ContentTile({
  file,
  isSelecting,
  isSelected,
  onToggleSelect,
  onApprove,
  onRequestRevision,
  onDownload,
  onPreview,
}: ContentTileProps) {
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [feedback, setFeedback] = useState('');

  const config = STATUS_CONFIG[file.status];
  const isVideo = file.mimeType.startsWith('video/');
  const isNotSubmitted = file.status === 'not_submitted';

  const handleThumbnailClick = () => {
    if (isSelecting && file.fileId) {
      onToggleSelect(file.fileId);
    } else if (!isNotSubmitted) {
      onPreview(file);
    }
  };

  return (
    <div className={`rounded-xl border-2 ${config.border} bg-white overflow-hidden`}>
      {/* Thumbnail area */}
      <button
        onClick={handleThumbnailClick}
        disabled={isNotSubmitted}
        className="relative w-full h-[120px] bg-gray-100 rounded-t-xl overflow-hidden"
      >
        {isVideo ? (
          <VideoFrameThumbnail
            fileId={file.fileId ?? ''}
            videoUrl={file.filePath ? supabase.storage.from(file.bucketName).getPublicUrl(file.filePath).data.publicUrl : null}
            storedThumbnailUrl={file.thumbnailUrl}
            mimeType={file.mimeType}
            filename={file.originalFilename}
          />
        ) : file.thumbnailUrl ? (
          <img
            src={file.thumbnailUrl}
            alt={file.originalFilename}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff className="h-8 w-8 text-gray-300" />
          </div>
        )}

        {/* Status badge */}
        <span className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${config.bg}`}>
          {config.label}
        </span>

        {/* Multi-select checkbox */}
        {isSelecting && file.fileId && (
          <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border-2 flex items-center justify-center ${
            isSelected ? 'bg-dc-teal border-dc-teal' : 'bg-white/80 border-gray-300'
          }`}>
            {isSelected && <span className="text-white text-xs">✓</span>}
          </div>
        )}
      </button>

      {/* Info */}
      <div className="p-2">
        <p className="text-xs font-medium text-gray-900 truncate">{file.originalFilename}</p>
        <p className="text-[10px] text-gray-500 truncate">{file.creatorHandle}</p>
        {file.fileSize > 0 && (
          <p className="text-[10px] text-gray-400">{(file.fileSize / (1024 * 1024)).toFixed(1)} MB</p>
        )}
      </div>

      {/* Actions */}
      <div className="px-2 pb-2">
        {file.status === 'approved' && (
          <Button
            size="sm"
            className="w-full rounded-full bg-dc-teal-btn text-white text-xs h-7"
            onClick={() => onDownload(file)}
          >
            <Download className="h-3 w-3 mr-1" /> Download
          </Button>
        )}

        {file.status === 'submitted' && !showRevisionInput && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="flex-1 rounded-full bg-dc-teal-btn text-white text-xs h-7"
              onClick={() => onApprove(file)}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 rounded-full text-amber-600 border-amber-400 text-xs h-7"
              onClick={() => setShowRevisionInput(true)}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Revise
            </Button>
          </div>
        )}

        {file.status === 'submitted' && showRevisionInput && (
          <div className="space-y-1.5">
            <Textarea
              placeholder="What needs changing?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={2}
              className="text-xs"
            />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="flex-1 text-xs h-7"
                disabled={!feedback.trim()}
                onClick={() => {
                  onRequestRevision(file, feedback);
                  setFeedback('');
                  setShowRevisionInput(false);
                }}
              >
                Send
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={() => { setShowRevisionInput(false); setFeedback(''); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {file.status === 'revision_requested' && (
          <p className="text-xs text-amber-500 text-center">Revision sent</p>
        )}

        {file.status === 'not_submitted' && (
          <p className="text-xs text-gray-400 text-center">Not submitted</p>
        )}
      </div>
    </div>
  );
}
