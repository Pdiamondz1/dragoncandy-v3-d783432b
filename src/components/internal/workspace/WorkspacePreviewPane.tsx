import { ExternalLink, X } from 'lucide-react';
import type { WorkspaceFile } from '@/hooks/internal/useGoogleWorkspace';
import { fileMeta, previewUrl } from './fileMeta';

interface WorkspacePreviewPaneProps {
  file: WorkspaceFile;
  onClose: () => void;
}

/**
 * Embedded Drive preview (Google permits embedding previews, not editors —
 * editing always opens docs.google.com in a new tab).
 */
export const WorkspacePreviewPane = ({ file, onClose }: WorkspacePreviewPaneProps) => {
  const { label } = fileMeta(file.mimeType);
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-dc-teal/30 bg-white/[0.04] backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{file.name}</p>
          <p className="text-xs text-white/50">{label} preview</p>
        </div>
        {file.webViewLink && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-dc-teal px-3.5 py-1.5 text-xs font-bold text-dc-dark transition-colors hover:bg-dc-teal-dark"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Edit in Google
          </a>
        )}
        <button
          type="button"
          aria-label="Close preview"
          onClick={onClose}
          className="rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <iframe
        title={`Preview of ${file.name}`}
        src={previewUrl(file.id)}
        className="min-h-[420px] w-full flex-1 lg:min-h-[540px]"
        allow="autoplay"
      />
    </div>
  );
};
