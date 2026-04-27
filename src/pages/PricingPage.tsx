import { useSearchParams, useNavigate } from 'react-router-dom';
import { TierComparisonGrid } from '@/components/pricing/TierComparisonGrid';
import { TIER_ORDER, type TierName } from '@/lib/pricing/tier-features';

const PricingPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const raw = searchParams.get('highlight');
  const highlightTier: TierName | null =
    raw && (TIER_ORDER as string[]).includes(raw) ? (raw as TierName) : null;

  const handleSelectTier = (_tier: TierName) => {
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-4 pt-12 pb-8 text-center md:pt-20 md:pb-12">
        <h1 className="text-3xl font-bold uppercase tracking-tight text-gray-900 md:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-gray-500">
          Start free and scale as your content needs grow. Every plan includes
          access to Donny AI and our creator marketplace.
        </p>
      </div>

      {/* Tier grid */}
      <div className="mx-auto max-w-5xl px-4 pb-16">
        <TierComparisonGrid
          highlightTier={highlightTier}
          onSelectTier={handleSelectTier}
        />
      </div>

      {/* Enterprise section */}
      <div className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-16 text-center md:py-20">
          <h2 className="text-2xl font-bold text-gray-900">Enterprise</h2>
          <p className="max-w-lg text-gray-500">
            Need custom integrations, unlimited seats, dedicated support, or an
            SLA? Let's build a plan that fits your organization.
          </p>
          <a
            href="mailto:sales@dragoncandy.io"
            className="inline-flex items-center justify-center rounded-full bg-pink-500 px-8 py-2.5 font-semibold text-white hover:bg-pink-600"
          >
            Talk to Sales
          </a>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
