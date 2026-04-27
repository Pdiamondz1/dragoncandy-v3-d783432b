import { useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { getFeature, TIER_PRICES, type TierName } from '@/lib/pricing/tier-features';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface SoftPaywallSheetProps {
  featureKey: string;
  open: boolean;
  onClose: () => void;
}

export function SoftPaywallSheet({ featureKey, open, onClose }: SoftPaywallSheetProps) {
  const { activeOrg, user } = useAuth();
  const navigate = useNavigate();
  const feature = getFeature(featureKey);
  const requiredTier = feature?.requiredTier || 'starter';
  const price = TIER_PRICES[requiredTier as TierName];

  const logEvent = async (action: 'viewed' | 'clicked_upgrade' | 'dismissed') => {
    await supabase.from('pricing_funnel_events' as any).insert({
      user_id: user?.id,
      org_id: activeOrg?.id,
      feature_key: featureKey,
      current_tier: activeOrg?.subscription_tier || 'free',
      required_tier: requiredTier,
      action,
    });
  };

  useEffect(() => {
    if (open) logEvent('viewed');
  }, [open]);

  const handleUpgrade = async () => {
    await logEvent('clicked_upgrade');
    navigate(`/pricing?highlight=${requiredTier}`);
    onClose();
  };

  const handleDismiss = async () => {
    await logEvent('dismissed');
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={handleDismiss}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{feature?.label} is part of {requiredTier}</SheetTitle>
        </SheetHeader>
        <p className="text-gray-600 mt-2">{feature?.description}</p>
        <p className="text-sm text-teal-600 italic mt-1">
          Donny recommends upgrading based on your usage.
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Starting at ${price?.monthly}/mo
        </p>
        <div className="flex flex-col gap-3 mt-6">
          <Button onClick={handleUpgrade} className="w-full rounded-full bg-teal-500">
            Upgrade to {requiredTier}
          </Button>
          <Button variant="outline" onClick={handleDismiss} className="w-full rounded-full">
            Maybe later
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
