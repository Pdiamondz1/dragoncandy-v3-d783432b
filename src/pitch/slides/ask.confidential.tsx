/**
 * The confidential half of the ask, split at BUILD time rather than at runtime.
 *
 * `/pitch` is a lazy chunk that anyone who guesses the URL can fetch until the edge
 * password gate ships. A runtime check — `is_internal_user()`, a session, a query
 * string — would still ship the raise figure and the budget inside the public
 * JavaScript and merely decline to paint them. That is not confidentiality; it is a
 * `display: none` on a number an investor's engineer could read in ten seconds.
 *
 * So the gate is `__PITCH_CONFIDENTIAL__`, a `define` in `vite.config.ts` set from
 * `VITE_PITCH_CONFIDENTIAL`. It is substituted as a literal `false`, the branch below
 * becomes unreachable and Rollup drops it. `@pitch/confidential` is aliased to a stub
 * in the same builds, so the real module never enters the graph at all. The default
 * bundle does not hide the numbers — it does not contain them.
 *
 * **It has to be a `define`, not `import.meta.env`.** The spec specified the latter and
 * it does not work: Vite only folds an env key that is SET, and the whole point here is
 * the build where it is unset. Left as `import.meta.env.VITE_PITCH_CONFIDENTIAL === '1'`,
 * the comparison happens at runtime, neither branch is dead, and every budget line ships
 * in the public bundle behind a false condition. That was the first thing
 * `npm run pitch:verify-public` found.
 *
 * That claim is checked, not asserted: `npm run pitch:verify-public` builds the default
 * bundle and scans `dist/` — `.map` files included — for every budget label and derived
 * total, with a control proving the scan can find things at all. A comment saying a
 * bundle is clean is worth nothing; this project has been wrong about exactly that kind
 * of claim before, and was again here.
 *
 * To present or send the complete deck:
 *
 *     VITE_PITCH_CONFIDENTIAL=1 npm run pitch:pdf
 *
 * The PDF is the delivery medium. The live URL is for the team, and must not be sent to
 * an investor until the site gate (#482) is merged and switched on.
 */
import {
  PRE_SEED_BUDGET,
  PRE_SEED_HORIZON_MONTHS,
  USE_OF_FUNDS_SPLIT,
  budgetTotal,
  buildFundsAllocation,
  requiredRaise,
} from '@pitch/confidential';
import { OPERATING } from '../model/assumptions';
import { Source, Tag } from '../deck/components';
import { money } from '../deck/format';

declare const __PITCH_CONFIDENTIAL__: boolean;

const CONFIDENTIAL = __PITCH_CONFIDENTIAL__;

/** The categories, with no amounts. Safe in a bundle a stranger can fetch. */
function PublicShape() {
  return (
    <div className="mt-7">
      <div className="flex gap-4">
        {(['Engineering', 'Go-to-market', 'G&A'] as const).map((bucket) => (
          <div
            key={bucket}
            className="flex-1 rounded-2xl border border-white/15 bg-white/5 px-6 py-5"
          >
            <p className="text-xl font-bold text-white">{bucket}</p>
            <p className="mt-1 text-base text-white/55">Amount in the confidential build</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-white/45">
        Budget, raise size and runway are omitted from this build by design. Run{' '}
        <code>VITE_PITCH_CONFIDENTIAL=1 npm run pitch:pdf</code> for the complete deck.
      </p>
    </div>
  );
}

function ConfidentialShape() {
  const operatingNeed = budgetTotal(PRE_SEED_BUDGET, PRE_SEED_HORIZON_MONTHS);
  const raise = requiredRaise({
    operatingNeed,
    bufferMonths: 3,
    endingMonthlyBurn: budgetTotal(PRE_SEED_BUDGET, 1),
  });
  const buckets = buildFundsAllocation(raise, USE_OF_FUNDS_SPLIT);

  return (
    <div className="mt-7">
      <div className="flex items-end gap-10">
        <div>
          <p className="text-6xl font-extrabold text-white">{money(raise)}</p>
          <p className="mt-1 text-lg text-white/60">
            derived bottom-up from a Hoboken-only budget over {PRE_SEED_HORIZON_MONTHS} months,
            plus a three-month buffer
          </p>
        </div>
        <div className="flex flex-1 gap-4">
          {buckets.map((b) => (
            <div key={b.key} className="flex-1 rounded-2xl border border-white/15 bg-white/5 px-6 py-4">
              <p className="text-xl font-bold text-white">{money(b.amount)}</p>
              <p className="mt-0.5 text-sm leading-snug text-white/60">{b.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Tag p="MODELED" dark />
        <Source dark>
          Not the $3M the older cost model recommends — that figure was built for a full team
          across three metros. This one buys one town, the outside engineering arrangement
          already in motion, founder salaries and the real{' '}
          {money(OPERATING.burnMonthly.value)}/month infrastructure line as it grows.
        </Source>
      </div>
    </div>
  );
}

export function AskFigures() {
  return CONFIDENTIAL ? <ConfidentialShape /> : <PublicShape />;
}
