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
 *
 * BRANDS DO NOT REACH THIS SLIDE, and the reason is not cosmetic. There is no brand
 * Connect path in the codebase at all: `create-restaurant-connect-account` and
 * `check-restaurant-payout-status` both filter `business_profiles.account_type =
 * 'restaurant'` on every statement, so a brand's writes would match zero rows and its
 * status read would find nothing — the slide would present a working setup flow that
 * silently did nothing, which is worse than not offering it. Production agrees: 6 brand
 * accounts, 0 with a Stripe account. Building that path means changing two money
 * functions and deploying them, which is a decision with a spec, not a side effect of an
 * onboarding slide. The brand `stripe` requirement therefore stays on the checklist and
 * stays unsatisfiable — recorded rather than hidden.
 *
 * Leaving for Stripe leaves the wizard, for every role. The hosted link's `return_url`
 * and `refresh_url` are built server-side and point at `/dashboard/<role>/settings`;
 * the client cannot influence them without an edge-function change. That is survivable
 * only because the core save now runs when the LAST COLLECT slide is left rather than at
 * the end — so anyone who disappears into Stripe already has complete profile rows and a
 * working dashboard. The copy below says so instead of implying they will come back here.
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
      <p className="text-xs text-center text-landing-ink-soft">
        Stripe takes over from here and returns you to your settings, not to this page.
        Everything you have entered is already saved.
      </p>
    </motion.div>
  );
}
