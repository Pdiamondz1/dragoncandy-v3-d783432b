import { useEffect, useState } from 'react';
import { BookPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { deriveWikiDefaults, validateSaveInput, saveErrorMessage, type WikiFolder } from '@/lib/internal/wikiSave';
import { useSaveAnswerToWiki } from '@/hooks/internal/useSaveAnswerToWiki';

interface SaveToKnowledgeButtonProps {
  /** The Donny answer markdown to capture. */
  markdown: string;
  /** The founder question that produced the answer (for traceability). */
  question?: string;
}

/** "Save to knowledge" — opens a GitHub PR creating a new docs/wiki/ page. */
export const SaveToKnowledgeButton = ({ markdown, question }: SaveToKnowledgeButtonProps) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState<WikiFolder>('analyses');
  const [filename, setFilename] = useState('');
  const [tags, setTags] = useState('');
  const save = useSaveAnswerToWiki();

  // Re-derive defaults each time the dialog opens for this answer.
  useEffect(() => {
    if (!open) return;
    const d = deriveWikiDefaults(markdown);
    setTitle(d.title);
    setFolder(d.folder);
    setFilename(d.filename);
    setTags('');
  }, [open, markdown]);

  const validation = validateSaveInput({ folder, filename, title });

  const run = () => {
    save.mutate(
      {
        folder,
        filename,
        title: title.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        markdown,
        question,
      },
      {
        onSuccess: (data) => {
          if (data.error) {
            // file_exists / github_not_configured — keep the dialog open so the
            // founder can rename or read the hint.
            toast.error(saveErrorMessage(data.error));
            return;
          }
          toast.success('Wiki PR opened', {
            action: data.url
              ? { label: 'Open PR', onClick: () => window.open(data.url, '_blank', 'noopener') }
              : undefined,
          });
          setOpen(false);
        },
        onError: () => toast.error('Save failed — try again.'),
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white/50 transition-colors hover:bg-white/[0.06] hover:text-dc-teal"
      >
        <BookPlus className="h-3.5 w-3.5" />
        Save to knowledge
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Save to knowledge base</DialogTitle>
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
                onChange={(e) => setFilename(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                className="mt-1"
              />
            </label>

            <label className="block text-xs font-semibold text-dc-text-muted">
              Tags (optional, comma-separated)
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="pricing, strategy" className="mt-1" />
            </label>

            <p className="text-xs text-dc-text-muted">
              Creates <code>docs/wiki/{folder}/{filename || '…'}.md</code> via a GitHub PR. It enters
              Donny's knowledge on the next sync after you merge.
            </p>
            {!validation.ok && <p className="text-xs text-dc-pink-accent">{validation.error}</p>}

            <button
              type="button"
              disabled={!validation.ok || save.isPending}
              onClick={run}
              className="w-full rounded-full bg-dc-teal px-6 py-2.5 font-bold text-dc-dark transition-colors hover:bg-dc-teal-dark disabled:opacity-50"
            >
              {save.isPending ? 'Opening PR…' : 'Open wiki PR'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
