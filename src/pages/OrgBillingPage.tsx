import { useState } from 'react';
import { CreditCard, Users, ArrowUpRight, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { WhyExpander } from '@/components/guidance/WhyExpander';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { SEAT_LIMITS } from '@/types/org';
import { TIER_PRICES } from '@/lib/pricing/tier-features';
import type { UserRole } from '@/types/user';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const TIER_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-100 text-blue-700',
  growth: 'bg-teal-100 text-teal-700',
  pro: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
};


export default function OrgBillingPage() {
  const { profile, activeOrg } = useAuth();
  const { data: myRole } = useMyOrgRole(activeOrg?.id);
  const { data: members = [] } = useOrgMembers(activeOrg?.id);
  const { toast } = useToast();
  useNavigate();
  const [upgrading, setUpgrading] = useState(false);

  const userRole = profile?.role ?? 'business_client';
  const tier = activeOrg?.subscription_tier ?? 'free';
  const limits = SEAT_LIMITS[tier];
  const seatCount = activeOrg?.seat_count ?? 1;
  const additionalSeats = Math.max(0, seatCount - limits.included);
  const additionalCost = additionalSeats * limits.additionalPriceMonthly;
  const baseCost = TIER_PRICES[tier as keyof typeof TIER_PRICES]?.monthly ?? 0;
  const totalCost = baseCost + additionalCost;
  const isOwner = myRole?.role === 'owner';
  const activeMembers = members.filter((m) => m.invitation_status === 'active');

  const handleManageBilling = async () => {
    if (!activeOrg?.stripe_customer_id) {
      toast({ title: 'No billing account', description: 'Upgrade to a paid plan first.', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
        body: { customer_id: activeOrg.stripe_customer_id },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout userRole={userRole as UserRole}>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Billing</h1>
              {activeOrg && <p className="text-sm text-muted-foreground">{activeOrg.name}</p>}
            </div>
            {isOwner && tier !== 'free' && (
              <Button onClick={handleManageBilling} variant="outline" className="gap-2 rounded-full">
                Manage billing
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </PageHeader>
        <div className="p-4 lg:p-6 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Current Plan</CardTitle>
              <Badge className={TIER_COLORS[tier]}>
                {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Seats</p>
                <p className="text-2xl font-bold">{seatCount}</p>
                <p className="text-xs text-muted-foreground">
                  {limits.included} included
                  {additionalSeats > 0 && `, ${additionalSeats} additional`}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Monthly cost</p>
                <p className="text-2xl font-bold">${totalCost}</p>
                {additionalCost > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ${baseCost} base + ${additionalCost} seats
                  </p>
                )}
              </div>
            </div>

            {tier === 'free' && isOwner && (
              <div className="rounded-lg border border-teal-300 bg-teal-50/50 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-teal-800">Upgrade to add teammates</p>
                  <p className="text-xs text-teal-700 mt-1">
                    The free plan includes 1 seat. Upgrade to Starter ($149/mo) to invite up to 3 additional team members.
                  </p>
                  <Button
                    size="sm"
                    disabled={upgrading}
                    onClick={async () => {
                      setUpgrading(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
                          body: { tier: 'starter', billing_period: 'monthly', org_id: activeOrg!.id },
                        });
                        if (error) throw error;
                        if (data?.checkout_url) window.location.href = data.checkout_url;
                      } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : String(err);
                        toast({ title: 'Checkout failed', description: message, variant: 'destructive' });
                      } finally {
                        setUpgrading(false);
                      }
                    }}
                    className="mt-3 rounded-full bg-teal-500 hover:bg-teal-600 text-white"
                  >
                    {upgrading ? 'Redirecting…' : 'Upgrade plan'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Team members ({activeMembers.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-3 py-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-teal-50 text-teal-600 text-xs font-semibold">
                      {(member.full_name ?? member.email ?? '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.full_name ?? member.email}</p>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">1 seat</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Available Plans</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(SEAT_LIMITS).filter(([t]) => t !== 'enterprise').map(([t, l]) => (
                <div
                  key={t}
                  className={`flex items-center justify-between rounded-lg border p-3 ${t === tier ? 'border-teal-400 bg-teal-50/30' : 'border-border'}`}
                >
                  <div>
                    <p className="font-medium text-sm capitalize">{t}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.included} seat{l.included > 1 ? 's' : ''} included
                      {l.maxAdditional ? `, up to ${l.maxAdditional} additional` : l.maxAdditional === null ? ', unlimited additional' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{TIER_PRICES[t as keyof typeof TIER_PRICES]?.monthly === 0 ? 'Free' : `$${TIER_PRICES[t as keyof typeof TIER_PRICES]?.monthly}/mo`}</p>
                    {l.additionalPriceMonthly > 0 && (
                      <p className="text-xs text-muted-foreground flex items-center">
                        +${l.additionalPriceMonthly}/seat
                        <WhyExpander expanderKey="per_seat_pricing" title="What is a seat?" body="Each seat is one team member. Your plan includes some seats free; extras are billed monthly." />
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
