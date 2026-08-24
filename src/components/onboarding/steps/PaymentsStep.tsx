import { motion } from '@/lib/motion';
import { StripeConnectSetup } from '@/components/settings/StripeConnectSetup';
import type { AccountRole } from '@/lib/accountReadiness/types';

interface PaymentsStepProps {
  role: AccountRole;
}

const COPY: Record<AccountRole, string> = {
  business_client: 'So you can pay creators the moment work is approved.',
  content_creator: 'So you get paid to your bank account when work is approved.',
  brand: 'So you can fund sponsorships without a delay.',
};

/**
 * Reuses the settings component rather than reimplementing Connect. It already owns
 * account creation, the onboarding link, and reading status back — and a second
 * implementation would be a second answer to "is this account ready to be paid",
 * which is the disagreement the readiness engine exists to remove.
 *
 * Stripe also satisfies `identity_verified`, not just `stripe`: the platform never
 * sees the tax ID, it mirrors Stripe's verdict. So this one slide clears two required
 * requirements, which is why REQUIREMENT_STEP maps both here.
 */
export function PaymentsStep({ role }: PaymentsStepProps) {
  return (
    <motion.div
      className="w-full flex flex-col gap-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <p className="text-sm text-center text-landing-ink-soft">{COPY[role]}</p>
      <StripeConnectSetup role={role === 'content_creator' ? 'creator' : 'business'} />
    </motion.div>
  );
}
