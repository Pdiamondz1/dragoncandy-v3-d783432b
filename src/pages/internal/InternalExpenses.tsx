import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  useOperatingExpenses,
  useExpenseMutations,
  type NewExpense,
} from '@/hooks/internal/useOperatingExpenses';
import { useRevenueStats } from '@/hooks/internal/useRevenueStats';
import { useCostStats } from '@/hooks/internal/useCostStats';
import { StatCard, SectionHeading, ErrorCard } from '@/components/internal/stats';
import { formatCents, formatUsd } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const CATEGORIES = ['hosting', 'infrastructure', 'ai', 'saas', 'legal', 'marketing', 'other'];

const emptyForm = { name: '', category: 'saas', amountUsd: '', notes: '' };

const InternalExpenses = () => {
  const expenses = useOperatingExpenses();
  const revenue = useRevenueStats();
  const cost = useCostStats();
  const { addExpense, updateExpense, deleteExpense } = useExpenseMutations();
  const [form, setForm] = useState(emptyForm);

  if (expenses.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (expenses.isError || !expenses.data) {
    return <ErrorCard message="Expenses failed to load — admin access is required for this page." />;
  }

  const rows = expenses.data;
  const monthlyOpexCents = rows
    .filter((e) => e.active)
    .reduce((sum, e) => sum + e.monthly_amount_cents, 0);
  // Burn revenue = DragonShare platform fees only. payment_events is excluded
  // deliberately: Stripe runs in test mode, so those events aren't real money yet.
  const mtdRevenueCents = revenue.data?.dragonshare_mtd.platform_fee_cents ?? 0;
  const mtdAiSpendUsd = cost.data?.mtd_spend_usd ?? 0;
  const mtdAiSpendCents = Math.round(mtdAiSpendUsd * 100);
  const netBurnCents = monthlyOpexCents + mtdAiSpendCents - mtdRevenueCents;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountUsd = parseFloat(form.amountUsd);
    if (!form.name.trim() || Number.isNaN(amountUsd) || amountUsd < 0) {
      toast.error('Name and a valid monthly amount are required.');
      return;
    }
    const expense: NewExpense = {
      name: form.name.trim(),
      category: form.category,
      monthly_amount_cents: Math.round(amountUsd * 100),
      notes: form.notes.trim() || undefined,
    };
    try {
      await addExpense.mutateAsync(expense);
      setForm(emptyForm);
      toast.success(`${expense.name} added.`);
    } catch (err) {
      console.error('Failed to add expense:', err);
      toast.error('Failed to add expense.');
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-dc-text">Expenses &amp; burn</h1>
      <p className="mb-6 text-sm text-dc-text-muted">
        Recurring operating costs (founder-entered) against revenue and live AI spend.
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Monthly opex" value={formatCents(monthlyOpexCents)} sub="Active recurring lines" />
        <StatCard label="MTD AI spend" value={formatUsd(mtdAiSpendUsd)} sub="Live from cost ledger" />
        <StatCard label="MTD revenue" value={formatCents(mtdRevenueCents)} sub="DragonShare platform fees" accent="pink" />
        <StatCard
          label={netBurnCents >= 0 ? 'Net burn (monthly)' : 'Net profit (monthly)'}
          value={formatCents(Math.abs(netBurnCents))}
          sub="Opex + AI spend − revenue"
          accent="pink"
        />
      </div>

      <SectionHeading>Recurring lines</SectionHeading>
      <div className="overflow-hidden rounded-2xl border border-teal-300 bg-dc-card">
        {rows.map((expense) => (
          <div
            key={expense.id}
            className="flex flex-wrap items-center gap-3 border-b border-teal-300/40 px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className={`font-semibold ${expense.active ? 'text-dc-text' : 'text-dc-text-muted line-through'}`}>
                {expense.name}
                <span className="ml-2 rounded-full bg-dc-teal/12 px-2 py-0.5 text-xs font-medium text-dc-teal-btn">
                  {expense.category}
                </span>
              </p>
              {expense.notes && <p className="truncate text-xs text-dc-text-muted">{expense.notes}</p>}
            </div>
            <span className="font-bold text-dc-text">{formatCents(expense.monthly_amount_cents)}/mo</span>
            <Switch
              checked={expense.active}
              onCheckedChange={(active) =>
                updateExpense.mutate(
                  { id: expense.id, active },
                  { onError: () => toast.error('Failed to update expense.') }
                )
              }
              aria-label={`${expense.name} active`}
            />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-dc-pink-accent hover:bg-dc-pink/20"
              aria-label={`Delete ${expense.name}`}
              onClick={() =>
                deleteExpense.mutate(expense.id, {
                  onSuccess: () => toast.success(`${expense.name} removed.`),
                  onError: () => toast.error('Failed to delete expense.'),
                })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-6 text-sm text-dc-text-muted">No expenses yet — add the first below.</p>
        )}
      </div>

      <SectionHeading>Add expense</SectionHeading>
      <form onSubmit={submit} className="rounded-2xl border border-teal-300 bg-dc-card p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <Input
            placeholder="Name (e.g. Codemagic)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select value={form.category} onValueChange={(category) => setForm({ ...form, category })}>
            <SelectTrigger aria-label="Category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Monthly $ (e.g. 49.99)"
            inputMode="decimal"
            value={form.amountUsd}
            onChange={(e) => setForm({ ...form, amountUsd: e.target.value })}
          />
          <Input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <Button
          type="submit"
          disabled={addExpense.isPending}
          className="mt-3 rounded-full bg-dc-teal font-semibold text-white hover:bg-dc-teal-dark"
        >
          {addExpense.isPending ? 'Adding…' : 'Add expense'}
        </Button>
      </form>
    </div>
  );
};

export default InternalExpenses;
