import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PaymentTimeline } from "@/components/payments/PaymentTimeline";
import { PaymentSummaryCards } from "@/components/payments/PaymentSummaryCards";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { PaymentEvent } from "@/hooks/usePaymentTimeline";
import type { UserRole } from "@/lib/paymentEducation";

type Tab = 'active' | 'completed' | 'issues';

const failureTypes = new Set(['escrow_failed', 'escrow_expired', 'transfer_failed', 'dispute_created']);
const terminalTypes = new Set(['transfer_created', 'payout_completed', 'refund_completed', 'dispute_resolved']);

function getUserRole(role: string | undefined): UserRole {
  if (role === 'content_creator') return 'creator';
  if (role === 'brand') return 'brand';
  return 'business';
}

export default function PaymentsPage() {
  const { user, userRole } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const role = getUserRole(userRole);

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
    <DashboardLayout>
      <div className="space-y-6 p-4 max-w-2xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">Your Payments</h1>
          <p className="text-sm text-gray-500 mt-1">See where your money is across all projects</p>
        </div>

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
            <PaymentSummaryCards events={allEvents} userRole={role} />

            {/* Tabs */}
            <div className="flex gap-2">
              {(['active', 'completed', 'issues'] as Tab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-teal-400 text-white'
                      : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === 'issues' && issueEntities.length > 0 && (
                    <Badge className="ml-1.5 bg-red-500 text-white text-xs px-1.5">{issueEntities.length}</Badge>
                  )}
                </button>
              ))}
            </div>

            {/* Entity list */}
            {displayed.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
                <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  {activeTab === 'active' && "No active payments right now."}
                  {activeTab === 'completed' && "No completed payments yet."}
                  {activeTab === 'issues' && "No payment issues. Everything looks good!"}
                </p>
              </div>
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
    </DashboardLayout>
  );
}
