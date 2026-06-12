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
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border-2 border-teal-400 bg-dc-card">
      <div className="flex items-center gap-2 border-b border-teal-300/50 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-dc-text">{file.name}</p>
          <p className="text-xs text-dc-text-muted">{label} preview</p>
        </div>
        {file.webViewLink && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-dc-teal px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-dc-teal-dark"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Edit in Google
          </a>
        )}
        <button
          type="button"
          aria-label="Close preview"
          onClick={onClose}
          className="rounded-full p-1.5 text-dc-text-muted transition-colors hover:bg-dc-teal/12 hover:text-dc-text"
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
