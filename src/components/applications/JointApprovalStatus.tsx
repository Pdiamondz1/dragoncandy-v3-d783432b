
import { CheckCircle, Clock, XCircle } from "lucide-react";

interface JointApprovalStatusProps {
  brandApprovalStatus: string;
  restaurantApprovalStatus: string;
  finalApprovalStatus: string;
  viewerRole: 'brand' | 'restaurant' | 'creator';
}

const statusConfig = {
  pending: { icon: Clock, label: 'Pending', className: 'text-yellow-600' },
  approved: { icon: CheckCircle, label: 'Approved', className: 'text-green-600' },
  rejected: { icon: XCircle, label: 'Rejected', className: 'text-red-600' },
};

export function JointApprovalStatus({
  brandApprovalStatus,
  restaurantApprovalStatus,
  finalApprovalStatus,
  viewerRole,
}: JointApprovalStatusProps) {
  if (viewerRole === 'creator') {
    if (finalApprovalStatus === 'approved') {
      return (
        <div className="flex items-center gap-1.5 text-green-600 text-sm">
          <CheckCircle className="h-4 w-4" />
          <span>You've been accepted! Payment is being processed.</span>
        </div>
      );
    }
    if (finalApprovalStatus === 'rejected') {
      return (
        <div className="flex items-center gap-1.5 text-red-600 text-sm">
          <XCircle className="h-4 w-4" />
          <span>Your application was not selected for this campaign.</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-yellow-600 text-sm">
        <Clock className="h-4 w-4" />
        <span>Application under review</span>
      </div>
    );
  }

  const otherRole = viewerRole === 'brand' ? 'Restaurant' : 'Brand';
  const otherStatus = viewerRole === 'brand' ? restaurantApprovalStatus : brandApprovalStatus;
  const myStatus = viewerRole === 'brand' ? brandApprovalStatus : restaurantApprovalStatus;
  const other = statusConfig[otherStatus as keyof typeof statusConfig] || statusConfig.pending;
  const OtherIcon = other.icon;

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-1.5 text-sm ${other.className}`}>
        <OtherIcon className="h-4 w-4" />
        <span>{otherRole}: {other.label}</span>
      </div>
      {myStatus === 'approved' && otherStatus === 'pending' && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-700">
          Waiting on {otherRole.toLowerCase()} approval
        </div>
      )}
    </div>
  );
}
