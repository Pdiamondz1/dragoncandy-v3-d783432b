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
      className={`group flex items-center gap-3 rounded-2xl border-2 bg-dc-card p-4 text-left transition-colors ${
        selected ? 'border-dc-teal' : 'border-teal-300/60 hover:border-dc-teal'
      }`}
    >
      <Icon className="h-8 w-8 shrink-0 text-dc-teal" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-dc-text">{file.name}</p>
        <p className="text-xs text-dc-text-muted">
          {label} · {getRelativeTime(file.modifiedTime)}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${file.name}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-full p-1.5 text-dc-text-muted transition-colors hover:bg-dc-teal/12 hover:text-dc-text"
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
          <DropdownMenuItem className="text-dc-pink-accent" onClick={() => actions.onTrash(file)}>
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
      <div className="rounded-3xl border-2 border-dashed border-teal-300 bg-dc-card p-10 text-center">
        <p className="text-sm font-semibold text-dc-text">No files yet</p>
        <p className="mt-1 text-sm text-dc-text-muted">
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
