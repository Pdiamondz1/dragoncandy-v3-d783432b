import { cn } from '@/lib/utils';

interface TestModeBannerProps {
  className?: string;
}

export function TestModeBanner({ className }: TestModeBannerProps) {
  const isTestMode = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_');
  if (!isTestMode) return null;

  return (
    <div className={cn('rounded-xl border-2 border-orange-400 bg-orange-50 px-4 py-3 space-y-1', className)}>
      <div className="flex items-center gap-3">
        <span className="text-lg">🧪</span>
        <p className="font-bold text-orange-800 text-sm">TEST MODE — No real money is charged</p>
      </div>
      <p className="text-xs text-orange-700 ml-8">
        Use test card <span className="font-mono font-bold">4242 4242 4242 4242</span> with any future expiry, any CVC, and any ZIP
      </p>
    </div>
  );
}
