// src/pages/CreatorDashboard.tsx
//
// A three-way switch, nothing else. The body that used to live here moved
// verbatim to CreatorOverview and is still reachable at
// /dashboard/creator/overview.
//
// Order matters: first-run is checked FIRST, so a brand-new creator always gets
// the mission list regardless of the flag.
import { DONNY_FIRST_DASHBOARD_ENABLED } from '@/lib/featureConfig';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';
import { CreatorDonnyHome } from '@/components/donny/CreatorDonnyHome';
import CreatorOverview from './CreatorOverview';

const CreatorDashboard = () => {
  const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();

  if (isFirstRun && missions) {
    return (
      <FirstRunDashboard
        role="content_creator"
        missions={missions}
        onCompleteMission={completeMission}
        onSkip={skipMissions}
      />
    );
  }

  if (!DONNY_FIRST_DASHBOARD_ENABLED) {
    return <CreatorOverview />;
  }

  return <CreatorDonnyHome />;
};

export default CreatorDashboard;
