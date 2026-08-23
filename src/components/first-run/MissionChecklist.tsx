import { useNavigate } from 'react-router-dom';
import { useAccountReadiness } from '@/hooks/useAccountReadiness';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import type { AccountRole, ResolvedRequirement } from '@/lib/accountReadiness';
import { MissionItem } from './MissionItem';

interface MissionChecklistProps {
  role: AccountRole;
  onSkip: () => void;
}

interface ViewMissionDef {
  key: string;
  emoji: string;
  title: string;
  subtitle: string;
  route: string;
}

/**
 * The four "did the user look at this once" events that have no row anywhere
 * to derive from (spec §7) — kept alongside, not merged into, the derived
 * requirements below. This is not the two-systems duplication the readiness
 * engine deletes: the derived requirements and these view-events track
 * disjoint facts, and the user just sees one combined list.
 *
 * Keys and routes mirror the map that used to live in
 * FirstRunDashboard.handleMissionGo, trimmed to the four keys
 * areMissionsComplete() still counts.
 */
const VIEW_MISSION_DEFS: Record<AccountRole, ViewMissionDef[]> = {
  business_client: [
    {
      key: 'browse_inspiration',
      emoji: '👀',
      title: 'Get inspired',
      subtitle: 'See what creators are making',
      route: '/dashboard/business/campaigns/create',
    },
  ],
  content_creator: [
    {
      key: 'view_campaigns',
      emoji: '👀',
      title: "See what's out there",
      subtitle: 'Campaigns matched to your skills',
      route: '/dashboard/creator/campaigns',
    },
  ],
  brand: [
    {
      key: 'select_style',
      emoji: '🎨',
      title: 'Pick your vibe',
      subtitle: 'What content style fits your brand?',
      route: '/dashboard/brand/style-picker',
    },
    {
      key: 'browse_creators',
      emoji: '🔍',
      title: 'Meet your matches',
      subtitle: 'Creators who fit your style',
      route: '/dashboard/brand/creators',
    },
  ],
};

/** Maps a derived status onto MissionItem's visual vocabulary. */
function itemStatus(req: ResolvedRequirement): 'active' | 'locked' | 'completed' {
  if (req.state.status === 'met') return 'completed';
  // `unknown` is deliberately 'locked' — the muted, non-actionable treatment.
  // It must never look like a failure and must never offer a GO button, because
  // we do not actually know there is anything to do.
  if (req.state.status === 'unknown') return 'locked';
  return 'active';
}

export function MissionChecklist({ role, onSkip }: MissionChecklistProps) {
  const navigate = useNavigate();
  const { requirements } = useAccountReadiness(role);
  const { missions } = useFirstRunMissions();
  const accentColor = role === 'brand' ? 'pink' : 'teal';

  // View-event missions have no `unknown` state — the blob is either loaded
  // or there is nothing to show yet (Ruling 1). Don't render a row for a fact
  // we haven't loaded.
  const missionsRecord = missions as unknown as Record<string, unknown> | null | undefined;
  const viewDefs = missionsRecord ? VIEW_MISSION_DEFS[role] : [];

  // Only a definitive `met` (derived) or `true` (view-event) counts. A green
  // tally built on unreachable sources is the exact drift this engine exists
  // to prevent.
  const completedCount =
    requirements.filter((r) => r.state.status === 'met').length +
    viewDefs.filter((d) => missionsRecord?.[d.key] === true).length;
  const totalCount = requirements.length + viewDefs.length;

  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-bold text-gray-900">Your Missions</span>
        <span className={`text-xs font-semibold ${accentColor === 'pink' ? 'text-pink-500' : 'text-teal-500'}`}>
          {completedCount} / {totalCount}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {requirements.map((req) => {
          const status = itemStatus(req);
          return (
            <div key={req.key} data-requirement-row data-status={req.state.status}>
              <MissionItem
                emoji={req.tier === 'recommended' ? '✨' : '📋'}
                title={req.label}
                subtitle={req.state.status === 'unknown' ? 'Checking…' : (req.state.detail ?? req.why)}
                status={status}
                accentColor={accentColor}
                onGo={status === 'active' ? () => navigate(req.resolve.route) : undefined}
              />
            </div>
          );
        })}
        {viewDefs.map((def) => {
          const isDone = missionsRecord?.[def.key] === true;
          const status: 'active' | 'completed' = isDone ? 'completed' : 'active';
          return (
            <div key={def.key} data-mission-row data-status={status}>
              <MissionItem
                emoji={def.emoji}
                title={def.title}
                subtitle={def.subtitle}
                status={status}
                accentColor={accentColor}
                onGo={status === 'active' ? () => navigate(def.route) : undefined}
              />
            </div>
          );
        })}
      </div>
      <button
        onClick={onSkip}
        className="w-full text-center text-xs text-gray-400 mt-4 hover:text-gray-600 transition-colors"
      >
        Skip for now
      </button>
    </div>
  );
}
