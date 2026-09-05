-- A stable mapping avoids creating a new Stripe Customer every time someone
-- starts Checkout before their first subscription webhook has arrived.
CREATE TABLE IF NOT EXISTS public.Valdor_billing_customers (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS Valdor_billing_customers_stripe_customer_id_idx
  ON public.Valdor_billing_customers (stripe_customer_id);
