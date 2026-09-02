-- A customer can cancel and later start a new Stripe subscription. Keep
-- subscription IDs unique, but allow multiple historical subscriptions for
-- the same Stripe customer.

ALTER TABLE public.virgue_subscriptions
  DROP CONSTRAINT IF EXISTS virgue_subscriptions_provider_customer_id_key;

CREATE INDEX IF NOT EXISTS virgue_subscriptions_provider_customer_id_idx
  ON public.virgue_subscriptions (provider_customer_id);
