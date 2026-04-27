import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';

export default function OrgBillingPage() {
  const { profile } = useAuth();
  return (
    <DashboardLayout userRole={(profile?.role ?? 'business_client') as any}>
      <div className="p-6">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground">Coming soon.</p>
      </div>
    </DashboardLayout>
  );
}
