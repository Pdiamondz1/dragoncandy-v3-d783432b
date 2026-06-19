import { memo } from 'react';
import { Download, ExternalLink, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WorkspaceFile } from '@/hooks/internal/useGoogleWorkspace';
import { getRelativeTime } from '@/lib/campaignUtils';
import { fileMeta } from './fileMeta';

export interface FileActions {
  onSelect: (file: WorkspaceFile) => void;
  onRename: (file: WorkspaceFile) => void;
  onTrash: (file: WorkspaceFile) => void;
}

interface WorkspaceFileGridProps {
  files: WorkspaceFile[];
  selectedId: string | null;
  actions: FileActions;
}

const FileCard = memo(({ file, selected, actions }: { file: WorkspaceFile; selected: boolean; actions: FileActions }) => {
  const { icon: Icon, label } = fileMeta(file.mimeType);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => actions.onSelect(file)}
      onKeyDown={(e) => e.key === 'Enter' && actions.onSelect(file)}
      className={`group flex items-center gap-3 rounded-2xl border bg-white/[0.04] p-4 text-left backdrop-blur-sm transition-colors ${
        selected ? 'border-dc-teal' : 'border-dc-teal/25 hover:border-dc-teal/60'
      }`}
    >
      <Icon className="h-8 w-8 shrink-0 text-dc-teal" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{file.name}</p>
        <p className="text-xs text-white/50">
          {label} · {getRelativeTime(file.modifiedTime)}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${file.name}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {file.webViewLink && (
            <DropdownMenuItem onClick={() => window.open(file.webViewLink, '_blank', 'noopener')}>
              <ExternalLink className="mr-2 h-4 w-4" /> Open in Google
            </DropdownMenuItem>
          )}
          {file.webContentLink && (
            <DropdownMenuItem onClick={() => window.open(file.webContentLink, '_blank', 'noopener')}>
              <Download className="mr-2 h-4 w-4" /> Download
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => actions.onRename(file)}>
            <Pencil className="mr-2 h-4 w-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem className="text-dc-pink" onClick={() => actions.onTrash(file)}>
            <Trash2 className="mr-2 h-4 w-4" /> Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
FileCard.displayName = 'FileCard';

export const WorkspaceFileGrid = ({ files, selectedId, actions }: WorkspaceFileGridProps) => {
  if (!files.length) {
    return (
      <div className="rounded-3xl border border-dashed border-dc-teal/40 bg-white/[0.03] p-10 text-center backdrop-blur-sm">
        <p className="text-sm font-semibold text-white">No files yet</p>
        <p className="mt-1 text-sm text-white/60">
          Create a doc, sheet, or slides — or drop a file here to upload it to Drive.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {files.map((file) => (
        <FileCard key={file.id} file={file} selected={file.id === selectedId} actions={actions} />
      ))}
    </div>
  );
};
