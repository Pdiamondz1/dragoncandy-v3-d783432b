import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRejectContent } from "@/hooks/useRejectContent";

interface RejectContentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborationId: string;
}

export function RejectContentModal({ open, onOpenChange, collaborationId }: RejectContentModalProps) {
  const [reason, setReason] = useState("");
  const rejectMutation = useRejectContent();

  const handleReject = () => {
    rejectMutation.mutate(
      { collaborationId, reason },
      { onSuccess: () => { onOpenChange(false); setReason(""); } }
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject Content</AlertDialogTitle>
          <AlertDialogDescription>
            This will open a dispute for mediation. Please explain why this content doesn't meet the campaign brief.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          placeholder="Explain why this content doesn't meet the brief (min 20 characters)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-[100px]"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReject}
            disabled={reason.length < 20 || rejectMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {rejectMutation.isPending ? "Rejecting..." : "Reject & Open Dispute"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
