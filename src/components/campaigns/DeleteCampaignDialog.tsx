import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

interface DeleteCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignTitle: string;
  applicationCount: number;
  invitationCount: number;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteCampaignDialog({
  open, onOpenChange, campaignTitle,
  applicationCount, invitationCount, onConfirm, isDeleting,
}: DeleteCampaignDialogProps) {
  const hasImpact = applicationCount > 0 || invitationCount > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{campaignTitle}"?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {hasImpact ? (
                <p>
                  This will permanently remove the campaign and notify{' '}
                  <strong>{applicationCount} creator{applicationCount !== 1 ? 's' : ''}</strong> who applied
                  {invitationCount > 0 && (
                    <> and <strong>{invitationCount} creator{invitationCount !== 1 ? 's' : ''}</strong> invited</>
                  )}
                  {' '}that the campaign has been cancelled.
                </p>
              ) : (
                <p>This will permanently remove the campaign. No one will be notified.</p>
              )}
              <div className="bg-red-50 rounded-lg p-3 text-sm text-red-800">
                <p className="font-semibold">This action cannot be undone:</p>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-red-700">
                  <li>Campaign removed from all views</li>
                  {applicationCount > 0 && <li>{applicationCount} pending application{applicationCount !== 1 ? 's' : ''} cancelled</li>}
                  {invitationCount > 0 && <li>{invitationCount} invitation{invitationCount !== 1 ? 's' : ''} withdrawn</li>}
                  {hasImpact && <li>Affected creators notified</li>}
                </ul>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting&hellip;</>
            ) : (
              'Delete Campaign'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
