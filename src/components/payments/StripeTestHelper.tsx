import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface StripeTestHelperProps {
  variant?: 'cards' | 'bank' | 'both';
  className?: string;
}

const TEST_CARDS = [
  { brand: 'Visa', number: '4242 4242 4242 4242', result: 'Always succeeds' },
  { brand: 'Mastercard', number: '5555 5555 5555 4444', result: 'Always succeeds' },
  { brand: 'Visa (decline)', number: '4000 0000 0000 9995', result: 'Always declines' },
];

const TEST_BANK = { routing: '110000000', account: '000123456789', ssn: '0000' };

export function StripeTestHelper({ variant = 'both', className }: StripeTestHelperProps) {
  const [expanded, setExpanded] = useState(true);
  const isTestMode = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_');
  if (!isTestMode) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, ''));
    toast.success('Copied!');
  };

  return (
    <div className={cn('border border-amber-300 rounded-xl overflow-hidden', className)}>
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 bg-amber-50 flex items-center justify-between text-left"
      >
        <span className="text-xs font-semibold text-amber-800">🧪 Test Credentials</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-amber-600" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-600" />
        )}
      </button>

      {expanded && (
        <div className="p-4 bg-white space-y-4">
          {/* Test Cards */}
          {(variant === 'cards' || variant === 'both') && (
            <div>
              <h4 className="text-xs font-bold text-gray-700 mb-2">Quick Test Cards</h4>
              <div className="space-y-2">
                {TEST_CARDS.map((card) => (
                  <div key={card.number} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-mono font-semibold text-gray-900">{card.number}</p>
                      <p className="text-[11px] text-gray-500">{card.brand} — {card.result}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(card.number)}
                      className="text-xs text-teal-600 font-semibold flex items-center gap-1 hover:text-teal-700"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Exp: any future date • CVC: any 3 digits • ZIP: any 5 digits</p>
            </div>
          )}

          {/* Test Bank */}
          {(variant === 'bank' || variant === 'both') && (
            <div>
              <h4 className="text-xs font-bold text-gray-700 mb-2">Creator Test Payouts</h4>
              <div className="px-3 py-2 bg-gray-50 rounded-lg space-y-1">
                <p className="text-xs text-gray-600">During Stripe Connect onboarding:</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Routing: <strong className="font-mono">{TEST_BANK.routing}</strong></span>
                  <button onClick={() => copyToClipboard(TEST_BANK.routing)} className="text-xs text-teal-600 font-semibold">Copy</button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Account: <strong className="font-mono">{TEST_BANK.account}</strong></span>
                  <button onClick={() => copyToClipboard(TEST_BANK.account)} className="text-xs text-teal-600 font-semibold">Copy</button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">SSN last 4: <strong className="font-mono">{TEST_BANK.ssn}</strong></span>
                  <button onClick={() => copyToClipboard(TEST_BANK.ssn)} className="text-xs text-teal-600 font-semibold">Copy</button>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Stripe auto-populates most fields in test mode. Just click through.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
