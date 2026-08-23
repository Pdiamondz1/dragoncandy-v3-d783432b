import { ROLE_REQUIREMENTS } from './requirements';
import { ACTION_REQUIREMENTS, type GatedAction } from './actions';
import type { ReadinessContext, ResolvedRequirement } from './types';

export * from './types';
export * from './actions';
export { ROLE_REQUIREMENTS } from './requirements';

export interface AccountReadiness {
  /** Every requirement for the role, resolved. */
  requirements: ResolvedRequirement[];
  required: ResolvedRequirement[];
  recommended: ResolvedRequirement[];
  /** Anything actionable: unmet or pending. Deliberately excludes `unknown`. */
  outstanding: ResolvedRequirement[];
  missingFor: (action: GatedAction) => ResolvedRequirement[];
  isBlocked: (action: GatedAction) => boolean;
}

/** Actionable means we have a definitive answer that something is not done. */
function isActionable(req: ResolvedRequirement): boolean {
  return req.state.status === 'unmet' || req.state.status === 'pending';
}

export function computeAccountReadiness(ctx: ReadinessContext): AccountReadiness {
  const requirements: ResolvedRequirement[] = ROLE_REQUIREMENTS[ctx.role].map(
    ({ derive, ...rest }) => ({ ...rest, state: derive(ctx) }),
  );

  const byKey = new Map(requirements.map((r) => [r.key, r]));

  const missingFor = (action: GatedAction): ResolvedRequirement[] =>
    ACTION_REQUIREMENTS[action]
      .map((key) => byKey.get(key))
      // A key the role does not have resolves to undefined and is dropped rather
      // than treated as missing. The Task 4 consistency test makes this
      // unreachable in practice; this keeps it fail-open if it ever regresses.
      .filter((r): r is ResolvedRequirement => r !== undefined)
      .filter(isActionable);

  return {
    requirements,
    required: requirements.filter((r) => r.tier === 'required'),
    recommended: requirements.filter((r) => r.tier === 'recommended'),
    outstanding: requirements.filter(isActionable),
    missingFor,
    isBlocked: (action) => missingFor(action).length > 0,
  };
}
