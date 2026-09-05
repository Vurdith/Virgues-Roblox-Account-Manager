-- Account, trial, subscription, and entitlement foundation.
-- Neon Auth owns identity/session tables in neon_auth; this migration only
-- adds Valdor billing tables in public.

CREATE TABLE IF NOT EXISTS public.Valdor_plans (
  plan_key text PRIMARY KEY,
  display_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  stripe_product_id text,
  stripe_price_id text UNIQUE,
  price_amount_cents integer CHECK (price_amount_cents IS NULL OR price_amount_cents >= 0),
  currency text NOT NULL DEFAULT 'gbp' CHECK (char_length(currency) = 3),
  billing_interval text CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year')),
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.Valdor_billing_settings (
  setting_key text PRIMARY KEY DEFAULT 'default' CHECK (setting_key = 'default'),
  trial_enabled boolean NOT NULL DEFAULT true,
  trial_days integer NOT NULL DEFAULT 14 CHECK (trial_days >= 0 AND trial_days <= 3650),
  trial_plan_key text NOT NULL DEFAULT 'pro' REFERENCES public.Valdor_plans(plan_key),
  grace_period_days integer NOT NULL DEFAULT 3 CHECK (grace_period_days >= 0 AND grace_period_days <= 30),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.Valdor_trial_grants (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days >= 0 AND duration_days <= 3650),
  source text NOT NULL DEFAULT 'signup',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= started_at)
);

CREATE TABLE IF NOT EXISTS public.Valdor_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  plan_key text NOT NULL REFERENCES public.Valdor_plans(plan_key),
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe', 'manual')),
  provider_customer_id text,
  provider_subscription_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS Valdor_subscriptions_user_id_idx
  ON public.Valdor_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS Valdor_subscriptions_status_idx
  ON public.Valdor_subscriptions (status);

CREATE TABLE IF NOT EXISTS public.Valdor_billing_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_message text
);

INSERT INTO public.Valdor_plans (
  plan_key,
  display_name,
  description,
  features
)
VALUES
  ('free', 'Free', 'The core Valdor workspace.', '{"tier":"free","limits":{"maxAccounts":2,"maxGames":2},"bulkLaunch":false}'::jsonb),
  ('pro', 'Valdor Pro', 'The complete Valdor workspace.', '{"tier":"pro","limits":{"maxAccounts":null,"maxGames":null},"bulkLaunch":true}'::jsonb)
ON CONFLICT (plan_key) DO NOTHING;

INSERT INTO public.Valdor_billing_settings (
  setting_key,
  trial_enabled,
  trial_days,
  trial_plan_key,
  grace_period_days
)
VALUES ('default', true, 14, 'pro', 3)
ON CONFLICT (setting_key) DO NOTHING;

CREATE OR REPLACE VIEW public.Valdor_current_entitlements AS
WITH configured AS (
  SELECT *
  FROM public.Valdor_billing_settings
  WHERE setting_key = 'default'
),
latest_subscription AS (
  SELECT DISTINCT ON (s.user_id)
    s.*
  FROM public.Valdor_subscriptions s
  ORDER BY
    s.user_id,
    COALESCE(s.current_period_end, s.trial_ends_at, s.updated_at, s.created_at) DESC,
    s.updated_at DESC
),
resolved AS (
  SELECT
    u.id AS user_id,
    u.email,
    u.name,
    t.started_at AS trial_started_at,
    t.ends_at AS trial_ends_at,
    s.id AS subscription_id,
    s.plan_key AS subscription_plan_key,
    s.status AS subscription_status,
    s.current_period_end,
    CASE
      WHEN s.status IN ('active', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        THEN s.plan_key
      WHEN s.status = 'past_due'
        AND COALESCE(s.current_period_end, now()) + (c.grace_period_days * interval '1 day') > now()
        THEN s.plan_key
      WHEN s.status = 'canceled'
        AND s.current_period_end > now()
        THEN s.plan_key
      WHEN c.trial_enabled
        AND t.ends_at > now()
        THEN c.trial_plan_key
      ELSE 'free'
    END AS plan_key,
    CASE
      WHEN s.status IN ('active', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        THEN 'active'
      WHEN s.status = 'past_due'
        AND COALESCE(s.current_period_end, now()) + (c.grace_period_days * interval '1 day') > now()
        THEN 'grace'
      WHEN s.status = 'canceled'
        AND s.current_period_end > now()
        THEN 'active'
      WHEN c.trial_enabled
        AND t.ends_at > now()
        THEN 'trial'
      ELSE 'free'
    END AS entitlement_status
  FROM neon_auth."user" u
  CROSS JOIN configured c
  LEFT JOIN public.Valdor_trial_grants t ON t.user_id = u.id
  LEFT JOIN latest_subscription s ON s.user_id = u.id
)
SELECT
  r.user_id,
  r.email,
  r.name,
  r.plan_key,
  p.display_name AS plan_name,
  p.features,
  r.entitlement_status,
  r.trial_started_at,
  r.trial_ends_at,
  r.subscription_id,
  r.subscription_plan_key,
  r.subscription_status,
  r.current_period_end
FROM resolved r
JOIN public.Valdor_plans p ON p.plan_key = r.plan_key;
