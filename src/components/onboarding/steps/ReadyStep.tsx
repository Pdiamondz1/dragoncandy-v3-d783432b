import { motion } from '@/lib/motion';
import { LandingButton } from '@/components/landing/LandingButton';
import { ROLE_REQUIREMENTS } from '@/lib/accountReadiness/requirements';
import type { AccountRole } from '@/lib/accountReadiness/types';
import { REQUIREMENT_STEP } from '../steps';
import { Loader2 } from 'lucide-react';

interface ReadyStepProps {
  name: string;
  role: AccountRole;
  onContinue: () => void;
  loading: boolean;
}

const HEADING: Record<AccountRole, string> = {
  business_client: "You're set up.",
  content_creator: "You're set up.",
  brand: "You're set up.",
};

/**
 * The closing slide. It lists the RECOMMENDED requirements that are not slides — read
 * from the same registry the dashboard checklist reads, so the two can never drift
 * into telling a new user different things about the same account.
 *
 * Deliberately links rather than collects. These are the items the founder chose to
 * keep out of the wizard so onboarding stays short; presenting them as a to-do list
 * with real destinations is the whole of their treatment here.
 */
export function ReadyStep({ name, role, onContinue, loading }: ReadyStepProps) {
  const optional = ROLE_REQUIREMENTS[role].filter(
    (r) => r.tier === 'recommended' && REQUIREMENT_STEP[r.key] === null,
  );

  return (
    <motion.div
      className="flex flex-col items-center gap-6 py-4 w-full"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="text-center">
        <h2 className="text-2xl font-display font-bold text-landing-ink">{HEADING[role]}</h2>
        {name.trim() && (
          <p className="text-sm text-landing-ink-soft mt-1">Welcome, {name.trim()}.</p>
        )}
      </div>

      {optional.length > 0 && (
        <div className="w-full rounded-2xl border-2 border-landing-line bg-white p-4">
          <p className="text-sm font-semibold text-landing-ink mb-2">
            {optional.length === 1 ? 'One optional thing, any time:' : `${optional.length} optional things, any time:`}
          </p>
          <ul className="flex flex-col gap-2">
            {optional.map((r) => (
              <li key={r.key} className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 w-1.5 h-1.5 rounded-full bg-landing-mint shrink-0" />
                <span className="text-sm text-landing-ink-soft">
                  <span className="text-landing-ink font-medium">{r.label}</span> — {r.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <LandingButton type="button" onClick={onContinue} disabled={loading} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go to dashboard'}
      </LandingButton>
    </motion.div>
  );
}
