import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface NameDialogProps {
  open: boolean;
  title: string;
  cta: string;
  initialName?: string;
  pending: boolean;
  onSubmit: (name: string) => void;
  onOpenChange: (open: boolean) => void;
}

/** Shared name prompt for "New Doc/Sheet/Slides" and rename. */
export const NameDialog = ({ open, title, cta, initialName, pending, onSubmit, onOpenChange }: NameDialogProps) => {
  const [name, setName] = useState(initialName ?? '');

  useEffect(() => {
    if (open) setName(initialName ?? '');
  }, [open, initialName]);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          maxLength={200}
          placeholder="Name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={submit}
          className="w-full rounded-full bg-dc-teal px-6 py-2.5 font-bold text-dc-dark transition-colors hover:bg-dc-teal-dark disabled:opacity-50"
        >
          {pending ? 'Working…' : cta}
        </button>
      </DialogContent>
    </Dialog>
  );
};
