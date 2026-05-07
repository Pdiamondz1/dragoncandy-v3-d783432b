import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Download, Sparkles } from 'lucide-react';
import { csvCell } from '@/lib/csvEscape';
import type { UserRole } from '@/types/user';

interface DragonShareBoostRow {
  id: string;
  amount_cents: number;
  platform_fee_cents: number;
  creator_payout_cents: number;
  status: string;
  boosted_at: string;
  tier_label: string;
  post: { id: string; creator_id: string; platform: string; content_type: string; creator: { full_name: string } | null } | null;
  org: { name: string } | null;
}

const AdminDragonShareLedger: React.FC = () => {
  const { profile } = useAuth();
  const userRole = (profile?.role as UserRole) ?? 'content_creator';

  const { data: boosts, isLoading } = useQuery({
    queryKey: ['admin-dragonshare-ledger'],
    queryFn: async (): Promise<DragonShareBoostRow[]> => {
      const { data, error } = await supabase
        .from('dragonshare_boosts')
        .select(`
          id, amount_cents, platform_fee_cents, creator_payout_cents, status, boosted_at, tier_label,
          post:dragonshare_posts(id, creator_id, platform, content_type,
            creator:profiles!dragonshare_posts_creator_id_fkey(full_name)),
          org:organizations!dragonshare_boosts_boosting_org_id_fkey(name)
        `)
        .order('boosted_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DragonShareBoostRow[];
    },
  });

  const stats = (boosts ?? []).reduce(
    (acc, b) => {
      if (b.status === 'transferred') {
        acc.grossCents += b.amount_cents;
        acc.feeCents += b.platform_fee_cents;
        acc.payoutCents += b.creator_payout_cents;
      } else if (b.status === 'refunded') {
        acc.refundCents += b.amount_cents;
      } else if (b.status === 'failed') {
        acc.failures += 1;
      }
      return acc;
    },
    { grossCents: 0, feeCents: 0, payoutCents: 0, refundCents: 0, failures: 0 }
  );

  function exportCsv() {
    const rows = [['Date', 'Creator', 'Org', 'Tier', 'Gross', 'Fee', 'Payout', 'Status']];
    (boosts ?? []).forEach((b) => {
      rows.push([
        new Date(b.boosted_at).toISOString(),
        b.post?.creator?.full_name ?? '',
        b.org?.name ?? '',
        b.tier_label,
        (b.amount_cents / 100).toFixed(2),
        (b.platform_fee_cents / 100).toFixed(2),
        (b.creator_payout_cents / 100).toFixed(2),
        b.status,
      ]);
    });
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dragonshare-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout userRole={userRole}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-teal-500" />
              DragonShare Ledger
            </h1>
            <p className="text-sm text-muted-foreground">Reconciliation report</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Gross Volume', value: `$${(stats.grossCents / 100).toFixed(0)}` },
            { label: 'Platform Revenue (20%)', value: `$${(stats.feeCents / 100).toFixed(0)}` },
            { label: 'Creator Payouts (80%)', value: `$${(stats.payoutCents / 100).toFixed(0)}` },
            { label: 'Refunds', value: `$${(stats.refundCents / 100).toFixed(0)}` },
            { label: 'Failures', value: String(stats.failures) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Boost table */}
        {isLoading ? (
          <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Creator</th>
                  <th className="text-left p-3 font-medium">Org</th>
                  <th className="text-right p-3 font-medium">Gross</th>
                  <th className="text-right p-3 font-medium">Fee</th>
                  <th className="text-right p-3 font-medium">Payout</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(boosts ?? []).map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="p-3">{new Date(b.boosted_at).toLocaleDateString()}</td>
                    <td className="p-3">{b.post?.creator?.full_name ?? '—'}</td>
                    <td className="p-3">{b.org?.name ?? '—'}</td>
                    <td className="p-3 text-right">${(b.amount_cents / 100).toFixed(2)}</td>
                    <td className="p-3 text-right">${(b.platform_fee_cents / 100).toFixed(2)}</td>
                    <td className="p-3 text-right">${(b.creator_payout_cents / 100).toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        b.status === 'transferred' ? 'bg-green-100 text-green-700' :
                        b.status === 'failed' ? 'bg-red-100 text-red-700' :
                        b.status === 'refunded' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminDragonShareLedger;
