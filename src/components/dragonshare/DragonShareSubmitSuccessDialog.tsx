import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

interface Props {
  open: boolean;
  orgName: string | null;
  onShareAnother: () => void;
  onDone: () => void;
}

export function DragonShareSubmitSuccessDialog({ open, orgName, onShareAnother, onDone }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onDone(); }}>
      <DialogContent className="rounded-3xl text-center max-w-sm">
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="h-14 w-14 rounded-full bg-dc-teal/15 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-dc-teal" />
          </div>
          <h2 className="text-lg font-bold text-dc-text">Sent to {orgName ?? 'the restaurant'}!</h2>
          <p className="text-sm text-dc-text-muted">
            They'll review your content and can boost it. You'll get notified either way.
          </p>
          <div className="flex flex-col gap-2 w-full mt-2">
            <Button onClick={onShareAnother} className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold">
              Share another
            </Button>
            <Button onClick={onDone} variant="ghost" className="w-full rounded-full text-dc-text-muted">
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
