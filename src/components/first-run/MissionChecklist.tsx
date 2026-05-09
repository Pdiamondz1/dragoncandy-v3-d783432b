import { MissionItem } from './MissionItem';
import type { UserRole, RoleMissions } from '@/types/firstRun';

interface MissionChecklistProps {
  role: UserRole;
  missions: RoleMissions;
  onMissionGo: (missionKey: string) => void;
  onSkip: () => void;
}

interface MissionDef {
  key: string;
  emoji: string;
  title: string;
  subtitle: string;
}

const MISSION_DEFS: Record<UserRole, MissionDef[]> = {
  business_client: [
    { key: 'browse_inspiration', emoji: '👀', title: 'Get inspired', subtitle: 'See what creators are making' },
    { key: 'create_campaign', emoji: '🪄', title: 'Create with Donny', subtitle: 'Donny does the work' },
    { key: 'launch_campaign', emoji: '🚀', title: 'Launch & attract creators', subtitle: 'Creators start applying' },
  ],
  content_creator: [
    { key: 'view_campaigns', emoji: '👀', title: "See what's out there", subtitle: 'Campaigns matched to your skills' },
    { key: 'add_portfolio', emoji: '📸', title: 'Show your best work', subtitle: 'Add 1 portfolio piece' },
    { key: 'apply_campaign', emoji: '🚀', title: 'Apply to a campaign', subtitle: 'Your first pitch' },
  ],
  brand: [
    { key: 'select_style', emoji: '🎨', title: 'Pick your vibe', subtitle: 'What content style fits your brand?' },
    { key: 'browse_creators', emoji: '🔍', title: 'Meet your matches', subtitle: 'Creators who fit your style' },
    { key: 'create_sponsorship', emoji: '💰', title: 'Sponsor a campaign', subtitle: 'Your first brand deal' },
  ],
};

function getMissionStatus(
  missions: RoleMissions,
  missionKey: string,
  defs: MissionDef[]
): 'active' | 'locked' | 'completed' {
  const value = (missions as Record<string, unknown>)[missionKey];
  if (value === true) return 'completed';

  const idx = defs.findIndex((d) => d.key === missionKey);
  if (idx === 0) return 'active';

  const prevKey = defs[idx - 1].key;
  const prevDone = (missions as Record<string, unknown>)[prevKey] === true;
  return prevDone ? 'active' : 'locked';
}

export function MissionChecklist({ role, missions, onMissionGo, onSkip }: MissionChecklistProps) {
  const defs = MISSION_DEFS[role];
  const accentColor = role === 'brand' ? 'pink' : 'teal';
  const completedCount = defs.filter((d) => (missions as Record<string, unknown>)[d.key] === true).length;

  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-bold text-gray-900">Your Missions</span>
        <span className={`text-xs font-semibold ${accentColor === 'pink' ? 'text-pink-500' : 'text-teal-500'}`}>
          {completedCount} / {defs.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {defs.map((def) => {
          const status = getMissionStatus(missions, def.key, defs);
          return (
            <MissionItem
              key={def.key}
              emoji={def.emoji}
              title={def.title}
              subtitle={def.subtitle}
              status={status}
              accentColor={accentColor}
              onGo={status === 'active' ? () => onMissionGo(def.key) : undefined}
            />
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
