import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OperatingExpense {
  id: string;
  name: string;
  category: string;
  monthly_amount_cents: number;
  notes: string | null;
  active: boolean;
}

export interface NewExpense {
  name: string;
  category: string;
  monthly_amount_cents: number;
  notes?: string;
}

const QUERY_KEY = ['aios', 'operating-expenses'];

export function useOperatingExpenses() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operating_expenses')
        .select('id, name, category, monthly_amount_cents, notes, active')
        .order('monthly_amount_cents', { ascending: false });
      if (error) {
        console.error('operating_expenses query failed:', error);
        throw error;
      }
      return (data ?? []) as OperatingExpense[];
    },
  });
}

export function useExpenseMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const addExpense = useMutation({
    mutationFn: async (expense: NewExpense) => {
      const { error } = await supabase.from('operating_expenses').insert(expense);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateExpense = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<OperatingExpense> & { id: string }) => {
      const { error } = await supabase.from('operating_expenses').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('operating_expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { addExpense, updateExpense, deleteExpense };
}
