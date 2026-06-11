-- AIOS PR 4: founder-editable recurring operating expenses.
-- Admin-only in both directions (spec decision 2: stakeholders see aggregate
-- revenue but not opex). AI spend is NOT entered here — it joins live from
-- donny_cost_ledger via aios_cost_stats().
CREATE TABLE IF NOT EXISTS public.operating_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  monthly_amount_cents integer NOT NULL CHECK (monthly_amount_cents >= 0),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operating_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operating_expenses_admin_all" ON public.operating_expenses;
CREATE POLICY "operating_expenses_admin_all" ON public.operating_expenses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_operating_expenses_updated_at
  BEFORE UPDATE ON public.operating_expenses
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
