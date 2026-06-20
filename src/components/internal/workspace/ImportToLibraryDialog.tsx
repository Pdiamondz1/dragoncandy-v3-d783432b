import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { deriveImportDefaults, validateImportInput, type WikiFolder } from '@/lib/internal/wikiImport';
import { useImportDocToLibrary } from '@/hooks/internal/useImportDocToLibrary';
import type { WorkspaceFile } from '@/hooks/internal/useGoogleWorkspace';

const IMPORT_ERRORS: Record<string, string> = {
  file_exists: 'A wiki page with that filename already exists — rename it.',
  doc_too_large: 'That doc is too large to import (over 50 KB of text).',
  unsupported_type: 'Only Google Docs, Sheets, and text files can be imported.',
  forbidden_file: 'That file is not in your DragonCandy AIOS folder.',
  not_connected: 'Connect Google Workspace first (/internal/workspace).',
  needs_reconnect: 'Your Google connection expired — reconnect at /internal/workspace.',
  github_not_configured: 'GitHub wiki token is not configured — ask an admin.',
};

interface ImportToLibraryDialogProps {
  /** The Drive file to import, or null when the dialog is closed. */
  file: WorkspaceFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Controlled dialog: imports an AIOS Drive doc as a new wiki PR in the Strategy library. */
export const ImportToLibraryDialog = ({ file, open, onOpenChange }: ImportToLibraryDialogProps) => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState<WikiFolder>('analyses');
  const [filename, setFilename] = useState('');
  const [tags, setTags] = useState('');
  const importDoc = useImportDocToLibrary();

  // Re-derive defaults each time the dialog opens for a new file.
  useEffect(() => {
    if (!open || !file) return;
    const d = deriveImportDefaults(file.name);
    setTitle(d.title);
    setFolder(d.folder);
    setFilename(d.filename);
    setTags('');
  }, [open, file]);

  const validation = validateImportInput({ folder, filename, title });

  const run = () => {
    if (!file) return;
    importDoc.mutate(
      {
        file_id: file.id,
        folder,
        filename,
        title: title.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      },
      {
        onSuccess: (data) => {
          if (data.error) {
            // Typed 200 error — keep dialog open so the founder can fix the input.
            const msg = IMPORT_ERRORS[data.error] ?? 'Import failed — try again.';
            toast.error(msg);
            return;
          }
          toast.success('Import PR opened — review & merge under Pending knowledge.', {
            action: { label: 'Review', onClick: () => navigate('/internal/corrections') },
          });
          onOpenChange(false);
        },
        onError: () => toast.error('Import failed — try again.'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Add to Strategy library</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-dc-text-muted">
            Title
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </label>

          <label className="block text-xs font-semibold text-dc-text-muted">
            Folder
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value as WikiFolder)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="analyses">analyses</option>
              <option value="concepts">concepts</option>
            </select>
          </label>

          <label className="block text-xs font-semibold text-dc-text-muted">
            Filename
            <Input
              value={filename}
              onChange={(e) =>
                setFilename(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, ''))
              }
              className="mt-1"
            />
          </label>

          <label className="block text-xs font-semibold text-dc-text-muted">
            Tags (optional, comma-separated)
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="strategy, gtm" className="mt-1" />
          </label>

          <p className="text-xs text-dc-text-muted">
            Creates <code>docs/wiki/{folder}/{filename || '…'}.md</code> via a GitHub PR. It enters
            Donny's knowledge on the next sync after you merge.
          </p>
          {!validation.ok && <p className="text-xs text-dc-pink-accent">{validation.error}</p>}

          <button
            type="button"
            disabled={!validation.ok || importDoc.isPending}
            onClick={run}
            className="w-full rounded-full bg-dc-teal px-6 py-2.5 font-bold text-dc-dark transition-colors hover:bg-dc-teal-dark disabled:opacity-50"
          >
            {importDoc.isPending ? 'Opening PR…' : 'Open wiki PR'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
