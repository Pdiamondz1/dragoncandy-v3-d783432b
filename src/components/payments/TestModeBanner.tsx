import { cn } from '@/lib/utils';

interface TestModeBannerProps {
  className?: string;
}

export function TestModeBanner({ className }: TestModeBannerProps) {
  const isTestMode = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_');
  if (!isTestMode) return null;

  return (
    <div className={cn('rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 flex items-center gap-3', className)}>
      <span className="text-lg">🧪</span>
      <div>
        <p className="font-bold text-amber-800 text-sm">TEST MODE — No real money is charged</p>
        <p className="text-xs text-amber-700">Use test card numbers to simulate payments</p>
      </div>
    </div>
  );
}
