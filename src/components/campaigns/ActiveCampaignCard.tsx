// src/components/campaigns/ActiveCampaignCard.tsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { CreatorCollaboration, DeliverableStatus } from '@/hooks/useCreatorCollaborations';
import { mapDeliveryType, formatBudget } from '@/lib/campaignUtils';
import DeliveryBadge from './DeliveryBadge';

interface ActiveCampaignCardProps {
  collaboration: CreatorCollaboration;
}

function getDeadlineDisplay(deadline: string | null): { text: string; urgent: boolean; overdue: boolean } {
  if (!deadline) return { text: 'No deadline set', urgent: false, overdue: false };

  const now = Date.now();
  const due = new Date(deadline).getTime();
  const diffMs = due - now;

  if (diffMs < 0) {
    const overMs = Math.abs(diffMs);
    const overHrs = Math.floor(overMs / 3600000);
    const overDays = Math.floor(overMs / 86400000);
    if (overDays > 0) return { text: `Overdue by ${overDays}d`, urgent: true, overdue: true };
    return { text: `Overdue by ${overHrs}h`, urgent: true, overdue: true };
  }

  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  const days = Math.floor(diffMs / 86400000);

  if (days > 0) return { text: `Due in ${days}d ${hrs % 24}h`, urgent: false, overdue: false };
  if (hrs > 0) return { text: `Due in ${hrs}h ${mins}m`, urgent: false, overdue: false };
  return { text: `Due in ${mins}m`, urgent: true, overdue: false };
}

function getProgress(status: Record<string, DeliverableStatus> | null): { done: number; total: number } | null {
  if (!status) return null;
  const entries = Object.values(status);
  if (entries.length === 0) return null;
  const done = entries.filter(s => s === 'submitted' || s === 'approved').length;
  return { done, total: entries.length };
}

function getStatusBadge(contentStatus: string | null): { label: string; className: string } {
  switch (contentStatus) {
    case 'revision_requested':
      return { label: 'Revision Requested', className: 'bg-orange-100 text-orange-700' };
    case 'submitted':
      return { label: 'Submitted', className: 'bg-teal-50 text-teal-700' };
    default:
      return { label: 'In Progress', className: 'bg-gray-100 text-gray-600' };
  }
}

export const ActiveCampaignCard: React.FC<ActiveCampaignCardProps> = ({ collaboration }) => {
  const navigate = useNavigate();
  const { campaign, business_profile } = collaboration;
  const businessName = business_profile?.business_name ?? 'Unknown Business';
  const businessLogo = business_profile?.logo_url;
  const deliveryTier = mapDeliveryType(campaign.delivery_type);
  const deadline = getDeadlineDisplay(collaboration.content_deadline);
  const progress = getProgress(collaboration.deliverables_status);
  const statusBadge = getStatusBadge(collaboration.content_status);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      {/* Header: logo + title + status badge */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
          {businessLogo ? (
            <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-dc-teal-dark">
              {businessName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{campaign.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{businessName} <span className="text-dc-teal">✓</span></p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 ${statusBadge.className}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* Revision requested alert */}
      {collaboration.content_status === 'revision_requested' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-2.5 mt-3 flex items-center gap-2">
          <span className="text-sm">⚠️</span>
          <p className="text-xs text-orange-800 font-medium">Revision requested · Check deliverable feedback</p>
        </div>
      )}

      {/* Deadline + delivery tier */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">⏱</span>
          <span className={`text-xs font-semibold ${
            deadline.overdue ? 'text-red-600' : deadline.urgent ? 'text-orange-600' : 'text-gray-700'
          }`}>
            {deadline.text}
          </span>
        </div>
        {deliveryTier && <DeliveryBadge deliveryType={deliveryTier} size="sm" showTimeframe={false} />}
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-gray-500">📦 {progress.done}/{progress.total} deliverables submitted</span>
            <span className="text-[11px] text-gray-400">{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-dc-teal rounded-full h-1.5 transition-all duration-300"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={() => navigate(`/campaigns/${campaign.id}`)}
        className="w-full bg-dc-teal text-white rounded-full py-2.5 font-bold text-sm mt-4 hover:bg-dc-teal-dark transition-colors active:scale-95 flex items-center justify-center gap-2"
      >
        <Upload className="w-4 h-4" />
        Upload Content
      </button>
    </div>
  );
};
