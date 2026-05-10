import { Film, Camera, Image, Images, LucideIcon } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CONTENT_ICONS: Record<string, LucideIcon> = {
  video_reel: Film,
  tiktok: Film,
  youtube_short: Film,
  photo: Camera,
  story: Image,
  carousel: Images,
};

type DeliverableStatus = 'pending' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved';

interface DeliverableCardProps {
  deliverable: { id: string; content_type: string; platform?: string; description?: string };
  status: DeliverableStatus;
  uploadedFile?: { file_name: string; file_size_bytes?: number } | null;
  feedback?: string | null;
  disabled?: boolean;
  onUpload?: () => void;
}

function formatFileSize(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

export function DeliverableCard({ deliverable, status, uploadedFile, feedback, disabled, onUpload }: DeliverableCardProps) {
  const Icon = CONTENT_ICONS[deliverable.content_type] || Film;

  const isUploaded = status === 'submitted' || status === 'in_progress';
  const isRevision = status === 'revision_requested';
  const isApproved = status === 'approved';
  const isPending = status === 'pending';

  const iconBg = isRevision
    ? 'bg-amber-100'
    : (isUploaded || isApproved)
      ? 'bg-teal-100'
      : 'bg-gray-100';

  const containerClass = cn(
    'rounded-2xl p-3',
    isPending && 'border-2 border-dashed border-gray-300',
    isUploaded && 'border-2 border-teal-200 bg-teal-50/50',
    isRevision && 'border-2 border-amber-300 bg-amber-50/50',
    isApproved && 'border-2 border-teal-200 bg-teal-50/50',
  );

  const title = deliverable.description || deliverable.content_type.replace(/_/g, ' ');
  const subtitle = deliverable.platform ? `${deliverable.platform}` : undefined;

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
          <Icon className="h-5 w-5 text-gray-700" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 capitalize">{title}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}

          {/* File info when uploaded */}
          {uploadedFile && (isUploaded || isApproved) && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {uploadedFile.file_name}
              {uploadedFile.file_size_bytes != null && ` (${formatFileSize(uploadedFile.file_size_bytes)})`}
            </p>
          )}

          {/* Feedback quote for revisions */}
          {isRevision && feedback && (
            <div className="bg-amber-100 rounded-lg p-2 text-xs italic text-amber-900 mt-2">
              {feedback}
            </div>
          )}
        </div>

        {/* Status indicator or action button */}
        <div className="shrink-0 flex items-center">
          {isPending && (
            <Button
              size="sm"
              className="rounded-full bg-dc-teal-btn text-white text-xs px-4"
              disabled={disabled}
              onClick={onUpload}
            >
              Upload
            </Button>
          )}

          {(isUploaded) && (
            <CheckCircle2 className="h-5 w-5 text-teal-500" />
          )}

          {isRevision && (
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className="border-amber-300 text-amber-700 text-xs">
                Needs revision
              </Badge>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full border-amber-300 text-amber-700 text-xs px-3"
                onClick={onUpload}
              >
                Re-upload
              </Button>
            </div>
          )}

          {isApproved && (
            <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-xs">
              Approved
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
