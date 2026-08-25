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
 * Leaving for Stripe used to leave the WIZARD: the hosted link's `return_url` and
 * `refresh_url` were built server-side and hardcoded to `/dashboard/<role>/settings`, so
 * "Complete Setup" on the last slide ended onboarding and the `ready` slide was never
 * reached. Founder-reported 2026-08-24 as "the UX here doesn't make sense", and they were
 * right — the copy under this component had grown into an apology for it.
 *
 * The client can now say where it wants the user back, via `returnPath`, resolved by
 * `_shared/connect-return.ts` against an exact allow-list (a PATH only — the origin stays
 * server-side, so no value here can point at another host). Pinned by
 * `PaymentsStep.test.tsx`, because dropping the prop breaks nothing observable until a
 * user has made a round trip through Stripe.
 *
 * The core save still runs when the LAST COLLECT slide is left rather than at the end, so
 * anyone who abandons the flow inside Stripe keeps complete profile rows and a working
 * dashboard. That safety net stays; it is simply no longer the plan.
 */
export function PaymentsStep({ role }: PaymentsStepProps) {
  return (
    <motion.div
      className="w-full flex flex-col gap-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <p className="text-sm text-center text-dc-text-muted">{COPY[role]}</p>
      {/*
        `returnPath` is what stops Stripe from ending onboarding. Without it the Connect
        link returns to the role's SETTINGS page, so "Complete Setup" on step 5 of 5 sent
        the user out of the wizard and the final slide was never reached. The copy below
        used to apologise for exactly that; it now describes what happens instead.
      */}
      <StripeConnectSetup
        role={role === 'content_creator' ? 'creator' : 'business'}
        returnPath="/profile/setup"
      />
      <p className="text-xs text-center text-dc-text-muted">
        Stripe opens in this window and brings you back here when you're done.
        Everything you have entered is already saved.
      </p>
    </motion.div>
  );
}
