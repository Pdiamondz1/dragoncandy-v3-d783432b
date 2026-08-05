import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, X, Loader2, Send } from 'lucide-react';
import { usePackageOrderDelivery } from '@/hooks/packages/usePackageOrderDelivery';
import type { OrderDeliverable } from '@/types/packages';

interface DeliveryRow {
  url: string;
  label: string;
}

const isValidUrl = (v: string): boolean => /^https?:\/\/\S+/i.test(v.trim());

/**
 * The creator's delivery form: one or more links to the finished work (Drive/Dropbox/YouTube/any public host)
 * plus an optional note, submitted through submit_package_deliverables → content_status='submitted', which is
 * what arms the buyer's Approve. Powers both the first delivery and a re-delivery after a revision (the copy
 * shifts via isResubmit). v1d delivers by link; direct file upload is a later pass.
 */
export const DeliverySubmitForm = ({
  orderId,
  isResubmit,
  onSubmitted,
}: {
  orderId: string;
  isResubmit: boolean;
  onSubmitted: () => void;
}) => {
  const { submit } = usePackageOrderDelivery(orderId);
  const [rows, setRows] = useState<DeliveryRow[]>([{ url: '', label: '' }]);
  const [note, setNote] = useState('');

  const setRow = (i: number, patch: Partial<DeliveryRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { url: '', label: '' }]);
  const removeRow = (i: number) => setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const validRows = rows.filter((r) => isValidUrl(r.url));
  const hasInvalid = rows.some((r) => r.url.trim() !== '' && !isValidUrl(r.url));
  const canSubmit = validRows.length > 0 && !hasInvalid && !submit.isPending;

  const onSubmit = async () => {
    if (validRows.length === 0) {
      toast.error('Add at least one link to your finished work.');
      return;
    }
    if (hasInvalid) {
      toast.error('Every link must start with http:// or https://');
      return;
    }
    const deliverables: OrderDeliverable[] = validRows.map((r) => ({
      url: r.url.trim(),
      label: r.label.trim() || undefined,
      kind: 'link',
    }));
    try {
      await submit.mutateAsync({ deliverables, note });
      toast.success(isResubmit ? 'Revised work sent — the buyer can review it now.' : 'Delivered — the buyer can review and approve.');
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit right now. Please try again.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">Link {i + 1}</Label>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove link ${i + 1}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Input
              value={row.url}
              onChange={(e) => setRow(i, { url: e.target.value })}
              placeholder="https://drive.google.com/…"
              inputMode="url"
              className="mt-2"
            />
            <Input
              value={row.label}
              onChange={(e) => setRow(i, { label: e.target.value })}
              placeholder="Label (optional) — e.g. “Reel 1 — hero dish”"
              className="mt-2"
            />
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5">
        <Plus className="h-4 w-4" /> Add another link
      </Button>

      <div>
        <Label htmlFor="delivery-note" className="text-xs font-semibold text-foreground">
          Note to the buyer (optional)
        </Label>
        <Textarea
          id="delivery-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything they should know about the files, revisions, or how to download…"
          rows={3}
          className="mt-2"
        />
      </div>

      <Button onClick={onSubmit} disabled={!canSubmit} size="lg" className="w-full gap-2">
        {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {isResubmit ? 'Send revised work' : 'Deliver work'}
      </Button>
    </div>
  );
};
