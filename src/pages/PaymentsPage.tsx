import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaymentTimeline } from "@/components/payments/PaymentTimeline";
import { PaymentSummaryCards } from "@/components/payments/PaymentSummaryCards";
import { useCreatorEarnings } from "@/hooks/useCreatorEarnings";
import { usePaymentNotifications } from "@/hooks/usePaymentNotifications";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AppCard } from "@/components/app/AppCard";
import { AppChip } from "@/components/app/AppChip";
import type { PaymentEvent } from "@/hooks/usePaymentTimeline";
import type { UserRole } from "@/lib/paymentEducation";
import type { UserRole as AppUserRole } from "@/types/user";

type Tab = 'active' | 'completed' | 'issues';

const failureTypes = new Set(['escrow_failed', 'escrow_expired', 'transfer_failed', 'dispute_created']);
// payout_pending_wallet is terminal for a collaboration: post wallet-first reroute EVERY payout ends the
// collaboration's ledger on it (the wallet→Stripe flush transfer is a separate user-keyed event), so a
// credited-to-wallet collaboration reads as Completed — for onboarded AND not-yet-onboarded creators alike.
const terminalTypes = new Set(['transfer_created', 'payout_completed', 'refund_completed', 'dispute_resolved', 'payout_pending_wallet']);

function getUserRole(role: string | undefined): UserRole {
  if (role === 'content_creator') return 'creator';
  if (role === 'brand') return 'brand';
  return 'business';
}

export default function PaymentsPage() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const role = getUserRole(profile?.role);

  // Single source of truth for the creator wallet balance (available is DOLLARS → convert to cents at the
  // call site). Gated on the creator role so business/brand users don't fire an unused
  // check-creator-payout-status invoke; useCreatorEarnings short-circuits (enabled: !!userId) on undefined.
  const { data: earnings } = useCreatorEarnings(role === 'creator' ? user?.id : undefined);

  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ['all-payment-events', user?.id],
    queryFn: async (): Promise<PaymentEvent[]> => {
      const { data, error } = await supabase
        .from('payment_events')
        .select('id, event_type, entity_type, entity_id, campaign_id, actor_id, actor_role, amount_cents, currency, stripe_id, metadata, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PaymentEvent[];
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  // content_submitted is not written to payment_events, so the pending-review
  // count comes from collaboration content_status like the rest of the app.
  const { data: pendingReviewCount } = useQuery({
    queryKey: ['payments-pending-review', user?.id, role],
    queryFn: async (): Promise<number> => {
      if (role === 'creator') {
        const { count, error } = await supabase
          .from('campaign_collaborations')
          .select('id', { count: 'exact', head: true })
          .eq('creator_id', user!.id)
          .eq('content_status', 'submitted');
        if (error) throw error;
        return count ?? 0;
      }
      const { data: myCampaigns, error: campaignsError } = await supabase
        .from('campaigns')
        .select('id')
        .eq('user_id', user!.id);
      if (campaignsError) throw campaignsError;
      if (!myCampaigns?.length) return 0;
      const { count, error } = await supabase
        .from('campaign_collaborations')
        .select('id', { count: 'exact', head: true })
        .in('campaign_id', myCampaigns.map(c => c.id))
        .eq('content_status', 'submitted');
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  usePaymentNotifications(allEvents, role);

  // Group events by entity
  const entityMap = new Map<string, { entityType: 'collaboration' | 'sponsorship'; entityId: string; campaignId: string; events: PaymentEvent[] }>();
  for (const event of allEvents) {
    const key = `${event.entity_type}:${event.entity_id}`;
    if (!entityMap.has(key)) {
      entityMap.set(key, { entityType: event.entity_type, entityId: event.entity_id, campaignId: event.campaign_id, events: [] });
    }
    entityMap.get(key)!.events.push(event);
  }

  const entities = Array.from(entityMap.values());
  const getLatestEvent = (events: PaymentEvent[]) => events[events.length - 1];

  const activeEntities = entities.filter(e => {
    const latest = getLatestEvent(e.events);
    return !terminalTypes.has(latest.event_type) && !failureTypes.has(latest.event_type);
  });
  const completedEntities = entities.filter(e => terminalTypes.has(getLatestEvent(e.events).event_type));
  const issueEntities = entities.filter(e => failureTypes.has(getLatestEvent(e.events).event_type));

  const displayed = activeTab === 'active' ? activeEntities : activeTab === 'completed' ? completedEntities : issueEntities;

  return (
    <DashboardLayout userRole={(profile?.role ?? 'business_client') as AppUserRole}>
      <div className="space-y-6 max-w-2xl mx-auto">
        <PageHeader>
          <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">Your Payments</h1>
          <p className="text-sm text-gray-500 mt-1">See where your money is across all projects</p>
        </PageHeader>
        <div className="px-4">

        {isLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : (
          <>
            <PaymentSummaryCards
              events={allEvents}
              userRole={role}
              pendingReviewCount={pendingReviewCount}
              pendingBalanceCents={Math.round((earnings?.available ?? 0) * 100)}
            />

            {/* Tabs */}
            <div className="flex gap-2">
              {(['active', 'completed', 'issues'] as Tab[]).map(tab => (
                <AppChip
                  key={tab}
                  active={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === 'issues' && issueEntities.length > 0 && (
                    <Badge className="ml-1.5 bg-red-500 text-white text-xs px-1.5">{issueEntities.length}</Badge>
                  )}
                </AppChip>
              ))}
            </div>

            {/* Entity list */}
            {displayed.length === 0 ? (
              <AppCard className="p-8 text-center">
                <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  {activeTab === 'active' && "No active payments right now."}
                  {activeTab === 'completed' && "No completed payments yet."}
                  {activeTab === 'issues' && "No payment issues. Everything looks good!"}
                </p>
              </AppCard>
            ) : (
              <div className="space-y-4">
                {displayed.map(entity => (
                  <PaymentTimeline
                    key={`${entity.entityType}:${entity.entityId}`}
                    entityType={entity.entityType}
                    entityId={entity.entityId}
                    campaignId={entity.campaignId}
                    userRole={role}
                    variant="full"
                  />
                ))}
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </DashboardLayout>
  );
}
