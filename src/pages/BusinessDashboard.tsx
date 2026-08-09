// src/pages/BusinessDashboard.tsx
//
// A three-way switch, nothing else. The body that used to live here moved
// verbatim to BusinessOverview and is still reachable at
// /dashboard/business/overview.
//
// Order matters: first-run is checked FIRST, so a brand-new owner always gets
// the mission list regardless of the flag.
import { DONNY_FIRST_DASHBOARD_ENABLED } from '@/lib/featureConfig';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';
import { DonnyHome } from '@/components/donny/DonnyHome';
import BusinessOverview from './BusinessOverview';

const BusinessDashboard = () => {
  const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();

  if (isFirstRun && missions) {
    return (
      <FirstRunDashboard
        role="business_client"
        missions={missions}
        onCompleteMission={completeMission}
        onSkip={skipMissions}
      />
    );
  }

  if (!DONNY_FIRST_DASHBOARD_ENABLED) {
    return <BusinessOverview />;
  }

  return <DonnyHome />;
};

export default BusinessDashboard;
