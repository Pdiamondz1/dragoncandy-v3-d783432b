import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useDonnyApplyPitch, type DonnyPitchResult } from '@/hooks/useDonnyApplyPitch';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface OneTapApplySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign;
  onSend: (pitch: DonnyPitchResult) => void;
  onEditDetails: (pitch: DonnyPitchResult) => void;
}

const TIER_AVAILABILITY: Record<string, string> = {
  dragonrush: 'Ready within 3 hours',
  expedited: 'Available within 48 hours',
  standard: 'Available this week',
};

export function OneTapApplySheet({
  open,
  onOpenChange,
  campaign,
  onSend,
  onEditDetails,
}: OneTapApplySheetProps) {
  const donnyPitch = useDonnyApplyPitch();

  useEffect(() => {
    if (open && !donnyPitch.data && !donnyPitch.isPending) {
      donnyPitch.mutate({
        campaignId: campaign.id,
        budgetMin: campaign.budget_min,
        budgetMax: campaign.budget_max,
      });
    }
  }, [open, campaign.id]);

  const pitch = donnyPitch.data;
  const availability = campaign.delivery_type
    ? TIER_AVAILABILITY[campaign.delivery_type] ?? 'Available this week'
    : 'Available this week';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-5 pt-6 pb-8 max-h-[60vh]">
        {donnyPitch.isPending ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-dc-teal" />
            <p className="text-sm text-gray-600 font-medium">
              Donny is preparing your application...
            </p>
          </div>
        ) : pitch ? (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-gray-900">Review Your Application</h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 uppercase">Rate</span>
                <span className="text-sm font-bold text-dc-teal">
                  ${pitch.suggested_rate}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 uppercase">When</span>
                <span className="text-sm text-gray-700">{availability}</span>
              </div>
              {pitch.suggested_portfolio_piece_url && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase">Sample</span>
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
                    <img
                      src={pitch.suggested_portfolio_piece_url}
                      alt="Portfolio sample"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Pitch</span>
                <p className="text-sm text-gray-700 italic bg-gray-50 rounded-xl p-3">
                  "{pitch.pitch}"
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => onSend(pitch)}
                className="w-full rounded-full bg-dc-teal text-white font-bold py-3.5 h-14 active:scale-[0.98] transition-transform"
              >
                Looks good — Send
              </button>
              <button
                onClick={() => onEditDetails(pitch)}
                className="w-full rounded-full border-2 border-gray-300 text-gray-600 font-semibold py-3 text-sm hover:border-gray-400 transition-colors"
              >
                Edit details
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">Something went wrong. Please try again.</p>
            <button
              onClick={() =>
                donnyPitch.mutate({
                  campaignId: campaign.id,
                  budgetMin: campaign.budget_min,
                  budgetMax: campaign.budget_max,
                })
              }
              className="mt-3 text-dc-teal text-sm font-semibold"
            >
              Retry
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
