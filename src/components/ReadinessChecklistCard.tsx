import { Button } from '@/components/ui/button';
import { AlertCircle, Clock, Unplug } from 'lucide-react';
import type { ReadinessStatus } from '@/lib/readiness';

interface Props {
  status: Extract<ReadinessStatus, 'no_account' | 'verification_pending' | 'reconnect_needed'>;
  role: 'creator' | 'business';
  onFinishSetup: () => void;
}

const COPY = {
  no_account: { icon: AlertCircle, title: 'Finish payout setup to get paid', cta: 'Set up payouts',
    body: (r: string) => `Connect your Stripe account so you can ${r === 'creator' ? 'receive' : 'process'} payments. It only takes a minute.` },
  verification_pending: { icon: Clock, title: 'Your payout account is being verified', cta: 'Complete setup',
    body: () => 'Stripe is still verifying your account. Finish the remaining steps to unlock this.' },
  reconnect_needed: { icon: Unplug, title: 'Reconnect your account', cta: 'Reconnect',
    body: () => 'Your connection needs to be re-established before you can continue.' },
} as const;

export function ReadinessChecklistCard({ status, role, onFinishSetup }: Props) {
  const c = COPY[status];
  const Icon = c.icon;
  const tone = status === 'verification_pending' ? 'border-yellow-200 bg-yellow-50' : 'border-teal-200 bg-teal-50';
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${tone}`} role="status">
      <div className="flex items-start gap-2">
        <Icon className="w-5 h-5 mt-0.5 text-dc-teal shrink-0" />
        <div>
          <p className="font-semibold text-dc-text">{c.title}</p>
          <p className="text-sm text-dc-text-muted">{c.body(role)}</p>
        </div>
      </div>
      <Button onClick={onFinishSetup} className="w-full rounded-full bg-teal-500 hover:bg-teal-600">{c.cta}</Button>
    </div>
  );
}
