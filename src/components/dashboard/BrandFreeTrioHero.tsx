import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, FileText, LayoutTemplate, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useTierGate } from '@/hooks/useTierGate';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { SoftPaywallSheet } from '@/components/pricing/SoftPaywallSheet';

interface BrandFreeTrioHeroProps {
  orgId?: string;
}

export function BrandFreeTrioHero({ orgId }: BrandFreeTrioHeroProps) {
  const navigate = useNavigate();
  const { openDonnyWithContext } = useDonnyContext();
  const matchGate = useTierGate('match_report');
  const briefGate = useTierGate('brief_generation');

  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState('match_report');

  const { data: templates } = useQuery({
    queryKey: ['campaign_templates', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_templates')
        .select('id, title, description, category, display_order')
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return data as { id: string; title: string; description: string; category: string; display_order: number }[];
    },
  });

  const openGatedPaywall = (featureKey: string) => {
    setPaywallFeature(featureKey);
    setShowPaywall(true);
  };

  const handleMatchReport = () => {
    if (!matchGate.allowed) {
      openGatedPaywall('match_report');
      return;
    }
    openDonnyWithContext('Generate a creator match report for our brand');
  };

  const handleBrandBrief = () => {
    if (!briefGate.allowed) {
      openGatedPaywall('brief_generation');
      return;
    }
    openDonnyWithContext('Generate a campaign brief tailored to our brand persona');
  };

  const handleTemplates = () => {
    navigate('/dashboard/brand/campaigns/create');
  };

  const templateCount = templates?.length ?? 0;

  return (
    <>
      <div className="space-y-3">
        {/* 3-card grid: stacked on mobile, 3-col on md+ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card A: Match Report (teal accent) */}
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
            <div className="h-1.5 bg-teal-400" />
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-500 shrink-0" />
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900">
                  Match Report
                </p>
              </div>
              <p className="text-sm text-gray-500 leading-snug">
                Top 5 creators ranked for your brand.
              </p>
              <Button
                variant="dc-primary"
                className="w-full rounded-full text-sm"
                onClick={handleMatchReport}
              >
                Get matches
              </Button>
            </div>
          </div>

          {/* Card B: Brand Brief (pink accent) */}
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
            <div className="h-1.5 bg-pink-400" />
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-pink-500 shrink-0" />
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900">
                  Brand Brief
                </p>
              </div>
              <p className="text-sm text-gray-500 leading-snug">
                AI campaign brief tailored to your brand.
              </p>
              <Button
                variant="dc-primary"
                className="w-full rounded-full text-sm"
                onClick={handleBrandBrief}
              >
                Generate brief
              </Button>
            </div>
          </div>

          {/* Card C: Sponsored Templates (gray accent) */}
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
            <div className="h-1.5 bg-gray-400" />
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-gray-500 shrink-0" />
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900">
                  Sponsored Templates
                </p>
              </div>
              <p className="text-sm text-gray-500 leading-snug">
                {templateCount > 0
                  ? `${templateCount} pre-built campaigns ready to customize.`
                  : 'Pre-built campaigns ready to customize.'}
              </p>
              <Button
                variant="dc-outline"
                className="w-full rounded-full text-sm"
                onClick={handleTemplates}
              >
                Browse templates
              </Button>
            </div>
          </div>
        </div>

        {/* Slim banner */}
        <div className="flex items-center justify-between rounded-full bg-white/60 px-4 py-2">
          <p className="text-xs text-gray-500">
            These tools stay free forever.
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className="flex items-center gap-1 text-xs font-semibold text-dc-teal hover:underline"
          >
            See plans
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      <SoftPaywallSheet
        featureKey={paywallFeature}
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
      />
    </>
  );
}
