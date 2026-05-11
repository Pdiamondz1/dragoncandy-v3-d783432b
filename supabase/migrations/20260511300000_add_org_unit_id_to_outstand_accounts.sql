ALTER TABLE public.business_outstand_accounts
  ADD COLUMN org_unit_id UUID REFERENCES public.org_units(id) ON DELETE SET NULL;

CREATE INDEX idx_business_outstand_accounts_org_unit
  ON public.business_outstand_accounts(org_unit_id);
