import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import type { Campaign } from '@/hooks/useCampaignQueries';
import { type CampaignPhase, type ProjectStep, needsBusinessAction } from '@/lib/campaignPhase';

interface CampaignDetailHeaderProps {
  campaign: Pick<
    Campaign,
    'title' | 'status' | 'escrow_status' | 'budget_min' | 'budget_max' |
    'fixed_price' | 'pricing_type' | 'delivery_fee' | 'deadline' | 'platforms'
  >;
  phase: CampaignPhase;
  currentStep: ProjectStep | null;
  onDelete: () => void;
  onRelaunch: () => void;
  onEdit: () => void;
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'draft':     return 'bg-gray-200 text-gray-700';
    case 'published': return 'bg-yellow-100 text-yellow-800';
    case 'active':    return 'bg-teal-100 text-teal-800';
    case 'completed': return 'bg-green-100 text-green-800';
    case 'cancelled': return 'bg-red-100 text-red-800';
    default:          return 'bg-gray-200 text-gray-700';
  }
}

function formatBudget(campaign: CampaignDetailHeaderProps['campaign']): string {
  if (campaign.pricing_type === 'fixed' && campaign.fixed_price) {
    const total = campaign.fixed_price + (campaign.delivery_fee || 0);
    return `$${total}`;
  }
  if (campaign.budget_min && campaign.budget_max) return `$${campaign.budget_min}–$${campaign.budget_max}`;
  if (campaign.budget_min) return `From $${campaign.budget_min}`;
  if (campaign.budget_max) return `Up to $${campaign.budget_max}`;
  return 'Budget TBD';
}

export const CampaignDetailHeader: React.FC<CampaignDetailHeaderProps> = ({
  campaign,
  phase,
  currentStep,
  onDelete,
  onRelaunch,
  onEdit,
}) => {
  const canDelete =
    phase === 'pre_hire' && campaign.escrow_status !== 'held';
  const canEdit = phase === 'pre_hire';
  const canRelaunch = phase === 'completed';
  const showActionNeeded =
    phase === 'active_delivery' && currentStep !== null && needsBusinessAction(currentStep);

  return (
    <div className="bg-pink-200 rounded-2xl p-4 space-y-2">
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-lg font-bold text-gray-900 flex-1 leading-tight">{campaign.title}</h1>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Status badge */}
          <Badge className={`${getStatusBadgeClass(campaign.status)} text-xs font-medium rounded-full`}>
            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
          </Badge>

          {/* Escrow status badge */}
          {campaign.escrow_status && campaign.escrow_status !== 'none' && (
            <Badge className={`text-xs font-medium rounded-full ${
              campaign.escrow_status === 'held'     ? 'bg-pink-100 text-pink-700' :
              campaign.escrow_status === 'released' ? 'bg-green-100 text-green-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {campaign.escrow_status === 'held'     ? 'Escrow Held' :
               campaign.escrow_status === 'released' ? 'Paid Out' :
               'Payment Pending'}
            </Badge>
          )}

          {/* Overflow menu */}
          {(canEdit || canDelete || canRelaunch) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={onEdit}>Edit Campaign</DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem onClick={onDelete} className="text-red-600">
                    Delete Campaign
                  </DropdownMenuItem>
                )}
                {canRelaunch && (
                  <DropdownMenuItem onClick={onRelaunch}>Re-Launch Campaign</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Stats line */}
      <p className="text-xs text-gray-600 flex flex-wrap gap-1.5">
        <span>{formatBudget(campaign)}</span>
        {campaign.deadline && (
          <>
            <span>·</span>
            <span>Due {format(new Date(campaign.deadline), 'MMM d, yyyy')}</span>
          </>
        )}
        {campaign.platforms && campaign.platforms.length > 0 && (
          <>
            <span>·</span>
            <span>
              {campaign.platforms.slice(0, 3).join(', ')}
              {campaign.platforms.length > 3 ? ` +${campaign.platforms.length - 3}` : ''}
            </span>
          </>
        )}
      </p>

      {/* Action needed badge */}
      {showActionNeeded && (
        <div className="pt-0.5">
          <Badge className="bg-pink-500 text-white text-xs font-semibold rounded-full animate-pulse">
            ⚡ Action Needed
          </Badge>
        </div>
      )}
    </div>
  );
};
