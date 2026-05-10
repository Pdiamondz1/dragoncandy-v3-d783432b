import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface RevisionRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliverables: Array<{ id: string; content_type: string; description?: string }>;
  revisionCount: number;
  maxRevisions: number;
  onSubmit: (feedback: Record<string, string>) => Promise<void>;
}

export function RevisionRequestModal({
  open,
  onOpenChange,
  deliverables,
  revisionCount,
  maxRevisions,
  onSubmit,
}: RevisionRequestModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [generalFeedback, setGeneralFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateFeedback = (id: string, text: string) => {
    setFeedbackMap((prev) => ({ ...prev, [id]: text }));
  };

  const hasDeliverables = deliverables.length > 0;

  const canSubmit = hasDeliverables
    ? selectedIds.size > 0 && [...selectedIds].every((id) => feedbackMap[id]?.trim())
    : generalFeedback.trim().length > 0;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (hasDeliverables) {
        const feedback: Record<string, string> = {};
        selectedIds.forEach((id) => {
          feedback[id] = feedbackMap[id] || '';
        });
        await onSubmit(feedback);
      } else {
        await onSubmit({ general: generalFeedback });
      }
      onOpenChange(false);
      setSelectedIds(new Set());
      setFeedbackMap({});
      setGeneralFeedback('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Revision</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Revision {revisionCount + 1} of {maxRevisions} — creator will resubmit updated content
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {hasDeliverables ? (
            deliverables.map((d) => (
              <div key={d.id} className="space-y-2">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`rev-${d.id}`}
                    checked={selectedIds.has(d.id)}
                    onCheckedChange={() => toggleId(d.id)}
                  />
                  <label htmlFor={`rev-${d.id}`} className="text-sm font-medium cursor-pointer">
                    {d.content_type}{d.description ? ` — ${d.description}` : ''}
                  </label>
                </div>

                {selectedIds.has(d.id) ? (
                  <Textarea
                    placeholder="What needs to change?"
                    value={feedbackMap[d.id] || ''}
                    onChange={(e) => updateFeedback(d.id, e.target.value)}
                    rows={3}
                    className="ml-7"
                  />
                ) : (
                  <Badge variant="secondary" className="ml-7 bg-teal-50 text-teal-700 border-teal-200">
                    Looks good ✓
                  </Badge>
                )}
              </div>
            ))
          ) : (
            <Textarea
              placeholder="Describe the changes you'd like the creator to make..."
              value={generalFeedback}
              onChange={(e) => setGeneralFeedback(e.target.value)}
              rows={4}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="bg-amber-600 hover:bg-amber-700 text-white rounded-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Revision Request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
