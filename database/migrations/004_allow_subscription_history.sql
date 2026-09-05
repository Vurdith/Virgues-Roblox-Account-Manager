-- A customer can cancel and later start a new Stripe subscription. Keep
-- subscription IDs unique, but allow multiple historical subscriptions for
-- the same Stripe customer.

ALTER TABLE public.Valdor_subscriptions
  DROP CONSTRAINT IF EXISTS Valdor_subscriptions_provider_customer_id_key;

CREATE INDEX IF NOT EXISTS Valdor_subscriptions_provider_customer_id_idx
  ON public.Valdor_subscriptions (provider_customer_id);
