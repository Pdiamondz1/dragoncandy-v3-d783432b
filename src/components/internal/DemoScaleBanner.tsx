import { isDemoScale } from '@/lib/internal/demoScale';

/** Global, unmissable marker that this instance is the 1M-DAU standup demo (synthetic data + projected
 *  metrics, not production). Self-gating: renders nothing unless isDemoScale(). Placed once in AppShell
 *  so it marks every surface. Brand-adjacent (no gray) per house rule. */
export function DemoScaleBanner() {
  if (!isDemoScale()) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-dc-pink-accent px-4 py-1.5 text-center text-xs font-bold text-white"
    >
      <span className="inline-block h-2 w-2 rounded-full bg-white/90" />
      DEMO — projected 1,000,000 DAU · synthetic data · not production
    </div>
  );
}
