/**
 * Light-theme, print-optimized one-pager for sharing the scorecard outside the app (investors have
 * no login). Self-contained: renders as a fixed full-screen overlay with its own print rules so only
 * #scorecard-snapshot survives `window.print()`.
 */
import type { ScorecardStory } from '@/lib/internal/scorecardModel';

const SIGNAL_LABEL: Record<ScorecardStory['signal'], string> = {
  green: 'On track',
  amber: 'Watch',
  info: '—',
};

const SIGNAL_DOT: Record<ScorecardStory['signal'], string> = {
  green: 'bg-dc-teal',
  amber: 'bg-dc-pink-accent',
  info: 'bg-gray-300',
};

interface ScorecardSnapshotProps {
  headline: string;
  stories: ScorecardStory[];
  asOf: string;
  onClose: () => void;
  onPrint?: () => void;
}

export function ScorecardSnapshot({
  headline,
  stories,
  asOf,
  onClose,
  onPrint = () => window.print(),
}: ScorecardSnapshotProps) {
  return (
    <div className="fixed inset-0 z-[70] overflow-auto bg-white p-8 print:static print:p-0">
      <style>{`@media print { body * { visibility: hidden; } #scorecard-snapshot, #scorecard-snapshot * { visibility: visible; } #scorecard-snapshot { position: absolute; inset: 0; } }`}</style>

      <div className="mx-auto mb-6 flex max-w-2xl justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={onPrint}
          className="rounded-full bg-dc-teal-btn px-4 py-2 text-sm font-bold text-white hover:bg-dc-teal-btn-hover"
        >
          Print / Save as PDF
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-dc-pink-accent px-4 py-2 text-sm font-semibold text-dc-pink-accent"
        >
          Close
        </button>
      </div>

      <div id="scorecard-snapshot" className="scorecard-snapshot mx-auto max-w-2xl bg-white text-gray-900 print:max-w-none">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">How DragonCandy is doing</p>
        <h1 className="mt-1 text-3xl font-extrabold text-gray-900">{headline}</h1>
        <p className="mt-1 text-xs text-gray-500">as of {asOf} · real users only</p>

        <div className="mt-6 space-y-5">
          {stories.map((story) => (
            <div key={story.key} className="border-t border-gray-200 pt-4 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{story.title}</p>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                  <span className={`h-2 w-2 rounded-full ${SIGNAL_DOT[story.signal]}`} />
                  {SIGNAL_LABEL[story.signal]}
                </span>
              </div>
              <p className="mt-1 text-lg font-bold text-gray-900">{story.headline}</p>
              <p className="mt-1 text-sm text-gray-600">{story.meaning}</p>
              {story.detail && <p className="mt-1 text-sm font-semibold text-gray-800">{story.detail}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
