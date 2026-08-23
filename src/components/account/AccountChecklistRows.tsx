import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAccountReadiness } from '@/hooks/useAccountReadiness';
import type { AccountRole } from '@/lib/accountReadiness';

interface Props {
  role: AccountRole;
}

/**
 * Outstanding account requirements, rendered as slots inside NeedsAttentionSection.
 *
 * Deliberately NOT a card of its own: /dashboard/business is Donny-first, and a
 * second competing card would fight him for the page. This joins the existing
 * consolidated attention frame, which already hides itself when empty.
 *
 * MUST return null — not an empty element — when there is nothing to show, or
 * the section's CSS :has() check resurrects its header around a blank frame.
 */
export function AccountChecklistRows({ role }: Props) {
  const navigate = useNavigate();
  const { outstanding, dismiss } = useAccountReadiness(role);

  // `outstanding` excludes `unknown` by construction, so an unreachable source
  // shows nothing rather than a false alarm.
  if (outstanding.length === 0) return null;

  return (
    <div className="divide-y divide-dc-teal/10">
      {outstanding.map((req) => (
        <div key={req.key} className="flex items-start gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-dc-text">{req.label}</p>
            <p className="text-xs text-dc-text-muted">{req.state.detail ?? req.why}</p>
          </div>
          <button
            onClick={() => navigate(req.resolve.route)}
            className="text-xs font-bold text-dc-teal-btn shrink-0"
          >
            {req.state.status === 'pending' ? 'CHECK' : 'GO'}
          </button>
          {req.tier === 'recommended' && (
            <button
              aria-label={`Dismiss ${req.label}`}
              onClick={() => dismiss(req.key)}
              className="text-dc-text-muted hover:text-dc-text shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
