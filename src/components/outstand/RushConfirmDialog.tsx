import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface RushConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platformCount: number;
  surchargeDisplay: string;
  onConfirm: () => void;
  isLoading: boolean;
}

export const RushConfirmDialog: React.FC<RushConfirmDialogProps> = ({
  open, onOpenChange, platformCount, surchargeDisplay, onConfirm, isLoading,
}) => {
  const isMobile = useIsMobile();

  const body = (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3 bg-gradient-to-br from-[#4DD9C0]/10 to-[#00E5CC]/10 rounded-xl p-4">
        <Zap className="h-8 w-8 text-dc-teal" />
        <div>
          <p className="text-sm font-bold text-gray-900">Rush Post to {platformCount} platforms</p>
          <p className="text-xs text-gray-500 mt-0.5">{surchargeDisplay} surcharge will be added to your next invoice</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="dc-primary"
          className="flex-1"
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? 'Posting...' : `Confirm Rush (${surchargeDisplay})`}
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(2rem,env(safe-area-inset-bottom))]">
          <SheetHeader><SheetTitle>DragonDash Rush</SheetTitle></SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>DragonDash Rush</DialogTitle></DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
};
