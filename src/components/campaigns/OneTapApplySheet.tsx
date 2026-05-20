import { useEffect, useState } from 'react';
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
  isInvited?: boolean;
  onCounterOffer?: (pitch: DonnyPitchResult, counterRate: number, message: string) => void;
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
  isInvited,
  onCounterOffer,
}: OneTapApplySheetProps) {
  const { data: pitchData, isPending: pitchPending, mutate: pitchMutate } = useDonnyApplyPitch();

  const [offerMode, setOfferMode] = useState<'accept' | 'offer'>('accept');
  const [counterRate, setCounterRate] = useState('');
  const [counterMessage, setCounterMessage] = useState('');

  useEffect(() => {
    if (open && !pitchData && !pitchPending) {
      pitchMutate({
        campaignId: campaign.id,
        budgetMin: campaign.budget_min,
        budgetMax: campaign.budget_max,
        fixedPrice: campaign.fixed_price,
      });
    }
  }, [open, campaign.id, campaign.budget_min, campaign.budget_max, campaign.fixed_price, pitchData, pitchPending, pitchMutate]);

  useEffect(() => {
    if (!open) {
      setOfferMode('accept');
      setCounterRate('');
      setCounterMessage('');
    }
  }, [open]);

  const availability = campaign.delivery_type
    ? TIER_AVAILABILITY[campaign.delivery_type] ?? 'Available this week'
    : 'Available this week';

  const isFixedPrice = campaign.fixed_price != null;
  const displayRate = isFixedPrice ? campaign.fixed_price : pitchData?.suggested_rate;

  const resolvePitch = (pitch: DonnyPitchResult): DonnyPitchResult =>
    isFixedPrice ? { ...pitch, suggested_rate: campaign.fixed_price! } : pitch;

  const handleCounterSubmit = () => {
    if (!pitchData || !onCounterOffer) return;
    const rate = Number(counterRate);
    if (!rate || rate < 50) return;
    const resolved = resolvePitch(pitchData);
    onCounterOffer(resolved, rate, counterMessage || resolved.pitch);
  };

  const handleAction = (cb: (pitch: DonnyPitchResult) => void) => {
    if (!pitchData) return;
    cb(resolvePitch(pitchData));
  };

  const showInviteNegotiation = isInvited && isFixedPrice && onCounterOffer;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-5 pt-6 pb-8 max-h-[60vh] sm:max-w-lg sm:right-auto sm:left-1/2 sm:-translate-x-1/2">
        {pitchPending ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-dc-teal" />
            <p className="text-sm text-gray-600 font-medium">
              Donny is preparing your application...
            </p>
          </div>
        ) : pitchData ? (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-gray-900">Review Your Application</h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 uppercase">{isFixedPrice ? 'Price' : 'Rate'}</span>
                <span className="text-sm font-bold text-dc-teal">
                  ${displayRate}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 uppercase">When</span>
                <span className="text-sm text-gray-700">{availability}</span>
              </div>
              {pitchData.suggested_portfolio_piece_url && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase">Sample</span>
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
                    <img
                      src={pitchData.suggested_portfolio_piece_url}
                      alt="Portfolio sample"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Pitch</span>
                <p className="text-sm text-gray-700 italic bg-gray-50 rounded-xl p-3">
                  "{pitchData.pitch}"
                </p>
              </div>
            </div>

            {showInviteNegotiation ? (
              <div className="space-y-3 pt-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOfferMode('accept')}
                    className={`flex-1 text-xs px-3 py-2 rounded-full font-semibold transition-colors ${
                      offerMode === 'accept'
                        ? 'bg-dc-teal-btn text-white'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-dc-teal'
                    }`}
                  >
                    Accept Price
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfferMode('offer')}
                    className={`flex-1 text-xs px-3 py-2 rounded-full font-semibold transition-colors ${
                      offerMode === 'offer'
                        ? 'bg-dc-pink-accent text-white'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-dc-pink-accent'
                    }`}
                  >
                    Counter Offer
                  </button>
                </div>

                {offerMode === 'offer' && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1.5">Your Offer</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dc-teal font-bold text-sm">$</span>
                        <input
                          type="number"
                          value={counterRate}
                          onChange={(e) => setCounterRate(e.target.value)}
                          className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
                          placeholder="Enter your offer"
                          min={50}
                          step={1}
                        />
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">Minimum offer: $50</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1.5">Message (optional)</label>
                      <textarea
                        value={counterMessage}
                        onChange={(e) => setCounterMessage(e.target.value.slice(0, 280))}
                        placeholder="Why you're proposing this rate…"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal resize-none h-[60px]"
                        maxLength={280}
                      />
                    </div>
                  </div>
                )}

                {offerMode === 'accept' ? (
                  <button
                    onClick={() => handleAction(onSend)}
                    className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3.5 h-14 active:scale-[0.98] transition-transform"
                  >
                    Accept & Apply
                  </button>
                ) : (
                  <button
                    onClick={handleCounterSubmit}
                    disabled={!counterRate || Number(counterRate) < 50}
                    className="w-full rounded-full bg-dc-pink-accent text-white font-bold py-3.5 h-14 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send Counter Offer
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => handleAction(onSend)}
                  className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3.5 h-14 active:scale-[0.98] transition-transform"
                >
                  Looks good — Send
                </button>
              </div>
            )}

            <button
              onClick={() => handleAction(onEditDetails)}
              className="w-full rounded-full border-2 border-gray-300 text-gray-600 font-semibold py-3 text-sm hover:border-gray-400 transition-colors"
            >
              Edit details
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">Something went wrong. Please try again.</p>
            <button
              onClick={() =>
                pitchMutate({
                  campaignId: campaign.id,
                  budgetMin: campaign.budget_min,
                  budgetMax: campaign.budget_max,
                  fixedPrice: campaign.fixed_price,
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
