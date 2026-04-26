import { AlertTriangle, CheckCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DisputeStatusBannerProps {
  contentStatus: string | null;
  disputeReason: string | null;
  disputeOutcome: string | null;
  viewerRole: 'business' | 'creator';
  conversationLink?: string;
}

export function DisputeStatusBanner({
  contentStatus,
  disputeReason,
  disputeOutcome,
  viewerRole,
  conversationLink,
}: DisputeStatusBannerProps) {
  if (!['disputed', 'rejected', 'resolved'].includes(contentStatus || '')) return null;

  if (contentStatus === 'disputed') {
    return (
      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 space-y-2">
        <div className="flex items-center gap-2 text-yellow-800">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-semibold">Disputed — Awaiting Resolution</span>
        </div>
        {disputeReason && (
          <p className="text-sm text-yellow-700">
            <span className="font-medium">Reason: </span>{disputeReason}
          </p>
        )}
        {conversationLink && (
          <Button variant="outline" size="sm" asChild>
            <a href={conversationLink}>
              <MessageCircle className="h-4 w-4 mr-1" />
              Open Conversation
            </a>
          </Button>
        )}
      </div>
    );
  }

  if (contentStatus === 'resolved') {
    const outcomeLabels: Record<string, string> = {
      refund: 'Full refund issued to restaurant',
      partial_payment: 'Partial payment — split between both parties',
      approved: 'Content approved by mediation',
    };

    return (
      <div className="rounded-xl border border-green-300 bg-green-50 p-4">
        <div className="flex items-center gap-2 text-green-800">
          <CheckCircle className="h-5 w-5" />
          <span className="font-semibold">Dispute Resolved</span>
        </div>
        <p className="text-sm text-green-700 mt-1">
          {outcomeLabels[disputeOutcome || ''] || 'Resolution complete'}
        </p>
      </div>
    );
  }

  return null;
}
