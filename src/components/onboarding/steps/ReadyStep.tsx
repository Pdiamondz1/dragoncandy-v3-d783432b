import { motion } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { ROLE_REQUIREMENTS } from '@/lib/accountReadiness/requirements';
import type { AccountRole } from '@/lib/accountReadiness/types';
import { uncoveredRecommendedKeys } from '../steps';
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
 *
 * "Not in the wizard" is decided per ROLE, not per requirement — see
 * uncoveredRecommendedKeys. A creator has no address slide where a business does, and
 * filtering on the shared step map alone hid the address item from exactly the creators
 * who needed it.
 */
export function ReadyStep({ name, role, onContinue, loading }: ReadyStepProps) {
  const uncovered = new Set(uncoveredRecommendedKeys(role, ROLE_REQUIREMENTS[role]));
  const optional = ROLE_REQUIREMENTS[role].filter((r) => uncovered.has(r.key));

  return (
    <motion.div
      className="flex flex-col items-center gap-6 py-4 w-full"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="text-center">
        <h2 className="text-2xl font-bold text-dc-text">{HEADING[role]}</h2>
        {name.trim() && (
          <p className="text-sm text-dc-text-muted mt-1">Welcome, {name.trim()}.</p>
        )}
      </div>

      {optional.length > 0 && (
        <div className="w-full rounded-2xl border-2 border-dc-teal/15 bg-white p-4">
          <p className="text-sm font-semibold text-dc-text mb-2">
            {optional.length === 1 ? 'One optional thing, any time:' : `${optional.length} optional things, any time:`}
          </p>
          <ul className="flex flex-col gap-2">
            {optional.map((r) => (
              <li key={r.key} className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 w-1.5 h-1.5 rounded-full bg-dc-teal shrink-0" />
                <span className="text-sm text-dc-text-muted">
                  <span className="text-dc-text font-medium">{r.label}</span> — {r.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button type="button" variant="dc-primary" size="lg" onClick={onContinue} disabled={loading} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go to dashboard'}
      </Button>
    </motion.div>
  );
}
