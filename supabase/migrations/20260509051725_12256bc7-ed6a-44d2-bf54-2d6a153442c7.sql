-- Restrict billing/Stripe identifier columns on organizations to service role only.
-- Edge functions (service role) bypass column privileges; client roles cannot read them.
REVOKE SELECT (billing_email, stripe_customer_id, stripe_subscription_id)
  ON public.organizations FROM anon, authenticated;