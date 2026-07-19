import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, Link as LinkIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useDonnyApplyPitch, type DonnyPitchResult } from '@/hooks/useDonnyApplyPitch';
import { getSignedProfileUrl } from '@/hooks/useSignedUrl';
import { uploadProfileAsset } from '@/lib/storage/uploadProfileAsset';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { sanitizeNumericInput } from '@/lib/inputUtils';
import type { Campaign } from '@/hooks/useCampaignQueries';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const toThumbnailUrl = (url: string, width = 128): string => {
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const storagePath = url.substring(idx + marker.length);
  if (/\.(mp4|mov|webm|avi)(\?|$)/i.test(storagePath)) return url;
  return `${SUPABASE_URL}/storage/v1/render/image/public/${storagePath}?width=${width}&quality=75`;
};

interface OneTapApplySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign;
  onSend: (pitch: DonnyPitchResult, portfolioUrl?: string) => void;
  onEditDetails: (pitch: DonnyPitchResult) => void;
  onCounterOffer?: (pitch: DonnyPitchResult, counterRate: number, message: string, portfolioUrl?: string) => void;
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
  onCounterOffer,
}: OneTapApplySheetProps) {
  const { data: pitchData, isPending: pitchPending, mutate: pitchMutate } = useDonnyApplyPitch();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [offerMode, setOfferMode] = useState<'accept' | 'offer'>('accept');
  const [counterRate, setCounterRate] = useState('');
  const [counterMessage, setCounterMessage] = useState('');

  const [sampleUrl, setSampleUrl] = useState('');
  const [selectedThumbIndex, setSelectedThumbIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [sampleExpanded, setSampleExpanded] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const mountedRef = useRef(true);

  const { data: portfolioThumbnails = [] } = useQuery({
    queryKey: ['creator-portfolio-urls', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: profile } = await supabase
        .from('creator_profiles')
        .select('portfolio_urls')
        .eq('user_id', user.id)
        .single();

      if (!profile?.portfolio_urls?.length) return [];

      const urls = await Promise.all(
        profile.portfolio_urls.map(async (path: string) => {
          if (!path) return null;
          return await getSignedProfileUrl(path);
        })
      );
      return urls.filter((u): u is string => u !== null);
    },
    enabled: !!user?.id && open,
  });

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
    if (pitchData?.suggested_portfolio_piece_url && !sampleUrl && selectedThumbIndex === null && !urlInput) {
      getSignedProfileUrl(pitchData.suggested_portfolio_piece_url).then((url) => {
        if (url && mountedRef.current) setSampleUrl(url);
      });
    }
  }, [pitchData?.suggested_portfolio_piece_url, sampleUrl, selectedThumbIndex, urlInput]);

  useEffect(() => {
    mountedRef.current = true;
    if (!open) {
      setOfferMode('accept');
      setCounterRate('');
      setCounterMessage('');
      setSampleUrl('');
      setSelectedThumbIndex(null);
      setSampleExpanded(false);
      setUrlInput('');
      setIsUploading(false);
    }
    return () => { mountedRef.current = false; };
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
    onCounterOffer(resolved, rate, counterMessage || resolved.pitch, sampleUrl || undefined);
  };

  const handleAction = (cb: (pitch: DonnyPitchResult, portfolioUrl?: string) => void) => {
    if (!pitchData) return;
    cb(resolvePitch(pitchData), sampleUrl || undefined);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setIsUploading(true);
    try {
      const { path } = await uploadProfileAsset({ file, userId: user.id, kind: 'sample' });
      const signedUrl = await getSignedProfileUrl(path);
      if (signedUrl && mountedRef.current) {
        setSampleUrl(signedUrl);
        setSelectedThumbIndex(null);
        setUrlInput('');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
    } finally {
      if (mountedRef.current) setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUrlInput = (value: string) => {
    setUrlInput(value);
    if (value.startsWith('http://') || value.startsWith('https://')) {
      setSampleUrl(value);
      setSelectedThumbIndex(null);
    }
  };

  const handleThumbSelect = (url: string, index: number) => {
    if (selectedThumbIndex === index) {
      setSelectedThumbIndex(null);
      setSampleUrl('');
    } else {
      setSelectedThumbIndex(index);
      setSampleUrl(url);
      setUrlInput('');
    }
  };

  // Negotiation used to be invited-only, which left every creator who found a campaign
  // organically with no way to counter — the counter-offer system existed but was unreachable
  // on this path. An unfavourable rate has to be answerable, not just declinable.
  //
  // Crew campaigns are excluded explicitly: they are free by DB constraint
  // (campaigns_group_free) and skip escrow, so a counter-offer would produce a paid-looking
  // application the free crew flow cannot honour. isFixedPrice does NOT filter them out — a
  // crew campaign carries fixed_price = 0, which is not null.
  const showNegotiation = isFixedPrice && campaign.group_id == null && onCounterOffer;

  const isVideoSample = sampleUrl && /\.(mp4|mov|webm|avi)(\?|$)/i.test(sampleUrl);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-5 pt-6 pb-8 max-h-[70vh] overflow-y-auto sm:!left-1/2 sm:!right-auto sm:!-translate-x-1/2 sm:!max-w-lg sm:bottom-4 sm:rounded-2xl">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
          className="hidden"
          onChange={handleFileUpload}
        />

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
              <div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase">{isFixedPrice ? 'Price' : 'Rate'}</span>
                  <span className="text-sm font-bold text-dc-teal">
                    {displayRate != null ? `$${displayRate.toLocaleString()}` : '—'}
                  </span>
                </div>
                {showNegotiation && (
                  <p className="text-[11px] text-dc-text-muted mt-1">
                    This price is negotiable — you can counter-offer below.
                  </p>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 uppercase">When</span>
                <span className="text-sm text-gray-700">{availability}</span>
              </div>

              {/* Sample section */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSampleExpanded(!sampleExpanded)}
                  className="flex justify-between items-center w-full"
                >
                  <span className="text-xs text-gray-500 uppercase">Sample</span>
                  <div className="flex items-center gap-2">
                    {sampleUrl && !isVideoSample && (
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-dc-teal/15">
                        <img
                          src={sampleUrl}
                          alt="Portfolio sample"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    {sampleUrl && isVideoSample && (
                      <div className="w-10 h-10 rounded-lg bg-dc-teal/[0.06] border border-dc-teal/15 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-gray-500">VIDEO</span>
                      </div>
                    )}
                    {!sampleUrl && (
                      <span className="text-xs text-gray-400">Add a sample</span>
                    )}
                    {sampleExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {sampleExpanded && (
                  <div className="space-y-2 pt-1">
                    {/* Portfolio thumbnails */}
                    {portfolioThumbnails.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 md:overflow-x-visible md:flex-wrap">
                        {portfolioThumbnails.map((url, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleThumbSelect(url, i)}
                            className={`w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all ${
                              selectedThumbIndex === i
                                ? 'border-dc-teal ring-2 ring-dc-teal'
                                : 'border-dc-teal/15 hover:border-dc-teal/30'
                            }`}
                          >
                            <img src={toThumbnailUrl(url)} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Upload + URL row */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-dc-teal/15 text-gray-600 hover:border-dc-teal hover:text-dc-teal transition-colors disabled:opacity-50"
                      >
                        {isUploading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        {isUploading ? 'Uploading…' : 'Upload'}
                      </button>
                    </div>

                    {/* URL paste input */}
                    <div className="relative">
                      <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => handleUrlInput(e.target.value)}
                        placeholder="https://your-portfolio.com/sample"
                        className="w-full pl-8 pr-3 py-2 border border-dc-teal/15 rounded-xl text-xs text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Pitch</span>
                <p className="text-sm text-gray-700 italic bg-dc-teal/[0.04] rounded-xl p-3">
                  "{pitchData.pitch}"
                </p>
              </div>
            </div>

            {showNegotiation ? (
              <div className="space-y-3 pt-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOfferMode('accept')}
                    className={`flex-1 text-xs px-3 py-2 rounded-full font-semibold transition-colors ${
                      offerMode === 'accept'
                        ? 'bg-dc-teal-btn text-white'
                        : 'bg-white text-gray-600 border border-dc-teal/15 hover:border-dc-teal'
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
                        : 'bg-white text-gray-600 border border-dc-teal/15 hover:border-dc-pink-accent'
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
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={counterRate}
                          onChange={(e) => setCounterRate(sanitizeNumericInput(e.target.value))}
                          className="w-full pl-7 pr-3 py-2.5 border border-dc-teal/15 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
                          placeholder="Enter your offer"
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
                        className="w-full px-3 py-2.5 border border-dc-teal/15 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal resize-none h-[60px]"
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
              className="w-full rounded-full border-2 border-dc-teal/20 text-gray-600 font-semibold py-3 text-sm hover:border-dc-teal/40 transition-colors"
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
