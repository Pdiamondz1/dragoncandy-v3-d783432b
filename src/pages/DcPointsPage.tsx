import { DashboardLayout } from '@/components/DashboardLayout';
import { PageBody } from '@/components/app/PageBody';
import { AppCard } from '@/components/app/AppCard';
import { StandingCard } from '@/components/rewards/StandingCard';
import { PointsHistory } from '@/components/rewards/PointsHistory';
import { EarnCatalog } from '@/components/rewards/EarnCatalog';
import { useAuth } from '@/hooks/useAuth';
import { useDragonRewardsEnabled } from '@/hooks/useDragonPoints';
import type { UserRole } from '@/types/user';

export default function DcPointsPage() {
  const enabled = useDragonRewardsEnabled();
  const { profile } = useAuth();
  // Same shell derivation NotificationsPage uses — an all-roles page inside
  // DashboardLayout, which owns page padding and mounts the nav (and the chip).
  const userRole = (profile?.role as UserRole) || 'business_client';

  return (
    <DashboardLayout userRole={userRole}>
      <PageBody maxWidth="4xl">
        {!enabled ? (
          <AppCard pad="6">
            <p className="text-sm text-dc-text-muted">DC Points are not available.</p>
          </AppCard>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold text-dc-text">DC Points</h1>
              <p className="mt-1 text-sm text-dc-text-muted">
                What you have earned, and how to earn more.
              </p>
            </div>

            <StandingCard />
            <PointsHistory />
            <EarnCatalog />

            {/* Block 4 — honest, earn-only. Do not add perks or a roadmap here. */}
            <AppCard pad="6">
              <h2 className="text-base font-bold text-dc-text">What standing does</h2>
              <p className="mt-2 text-sm text-dc-text-muted">
                Your standing badge is shown publicly on your profile, so businesses and
                creators can see how active you are at a glance. Your points balance is
                private to you. DC Points do not convert to money, credit, or discounts.
              </p>
            </AppCard>
          </>
        )}
      </PageBody>
    </DashboardLayout>
  );
}
