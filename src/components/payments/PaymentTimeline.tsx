import { CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";
import { usePaymentTimeline, type PaymentEvent } from "@/hooks/usePaymentTimeline";
import { getPaymentMessage, type UserRole } from "@/lib/paymentEducation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface PaymentTimelineProps {
  entityType: 'collaboration' | 'sponsorship';
  entityId: string;
  campaignId: string;
  userRole: UserRole;
  variant: 'compact' | 'full';
}

const failureEvents = new Set([
  'escrow_failed', 'escrow_expired', 'transfer_failed', 'dispute_created',
  'content_rejected', 'dispute_opened',
]);
const warningEvents = new Set(['review_extended', 'revision_requested']);

function getStepIcon(event: PaymentEvent, isLatest: boolean) {
  if (failureEvents.has(event.event_type)) {
    return <AlertCircle className="w-5 h-5 text-red-400" />;
  }
  if (warningEvents.has(event.event_type)) {
    return <AlertTriangle className="w-5 h-5 text-amber-400" />;
  }
  if (event.event_type === 'content_auto_approved' || event.event_type === 'dispute_resolved') {
    return <CheckCircle className="w-5 h-5 text-green-500" />;
  }
  if (isLatest) {
    return <div className="w-5 h-5 rounded-full bg-teal-400 ring-2 ring-teal-200 animate-pulse" />;
  }
  return <CheckCircle className="w-5 h-5 text-teal-400" />;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' at ' +
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatAmount(cents: number | null): string | null {
  if (!cents) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

export function PaymentTimeline({ entityType, entityId, userRole, variant }: PaymentTimelineProps) {
  const { data: events, isLoading, error } = usePaymentTimeline(entityType, entityId);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error || !events?.length) {
    return null; // Don't render if no events yet
  }

  const displayEvents = variant === 'compact' ? events.slice(-5) : events;

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100">
      <h3 className="text-sm font-bold text-gray-900 mb-3">
        {variant === 'compact' ? 'Payment Status' : 'Payment Timeline'}
      </h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[9px] top-3 bottom-3 w-0.5 bg-teal-200" />

        <div className="space-y-4">
          {displayEvents.map((event, index) => {
            const isLatest = index === displayEvents.length - 1;
            const message = getPaymentMessage(userRole, event.event_type);
            if (!message) return null;

            const amount = formatAmount(event.amount_cents);

            return (
              <div key={event.id} className="relative flex items-start gap-3 pl-0">
                <div className="relative z-10 mt-0.5 shrink-0">
                  {getStepIcon(event, isLatest)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isLatest ? 'text-gray-900' : 'text-gray-600'}`}>
                      {message.title}
                    </span>
                    {amount && (
                      <span className="text-xs font-medium text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
                        {amount}
                      </span>
                    )}
                  </div>
                  {(isLatest || variant === 'full') && (
                    <p className="text-xs text-gray-500 mt-0.5">{message.description}</p>
                  )}
                  {variant === 'full' && (
                    <p className="text-xs text-gray-400 mt-0.5">{formatTimestamp(event.created_at)}</p>
                  )}
                  {variant === 'full' && event.event_type === 'revision_requested' && Boolean(event.metadata?.notes) && (
                    <p className="text-xs text-amber-600 mt-1 italic">"{String(event.metadata.notes)}"</p>
                  )}
                  {Boolean(event.metadata?.platform_fee) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Platform fee: ${(Number(event.metadata.platform_fee) / 100).toFixed(2)}
                    </p>
                  )}
                  {isLatest && message.action && (
                    <Button size="sm" variant="outline" className="mt-2 h-7 text-xs rounded-full border-teal-300 text-teal-600">
                      {message.action}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {variant === 'compact' && (
        <Link
          to="/dashboard/payments"
          className="block text-xs text-teal-500 font-medium mt-3 hover:underline"
        >
          View full payment details
        </Link>
      )}
    </div>
  );
}
