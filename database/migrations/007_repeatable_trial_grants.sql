-- Allow multiple manual grants per account and keep the full trial history.
-- The entitlement view only considers a grant active when its scheduled start
-- has arrived and its end has not passed.

ALTER TABLE public.Valdor_trial_grants
  ADD COLUMN IF NOT EXISTS id uuid;

UPDATE public.Valdor_trial_grants
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.Valdor_trial_grants
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;

DO $$
DECLARE
  current_pk_name text;
  current_pk_definition text;
BEGIN
  SELECT c.conname, pg_get_constraintdef(c.oid)
  INTO current_pk_name, current_pk_definition
  FROM pg_constraint c
  WHERE c.conrelid = 'public.Valdor_trial_grants'::regclass
    AND c.contype = 'p'
  LIMIT 1;

  IF current_pk_name IS NOT NULL AND current_pk_definition <> 'PRIMARY KEY (id)' THEN
    EXECUTE format('ALTER TABLE public.Valdor_trial_grants DROP CONSTRAINT %I', current_pk_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.Valdor_trial_grants'::regclass
      AND c.contype = 'p'
      AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)'
  ) THEN
    ALTER TABLE public.Valdor_trial_grants
      ADD CONSTRAINT Valdor_trial_grants_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS Valdor_trial_grants_user_id_started_at_idx
  ON public.Valdor_trial_grants (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS Valdor_trial_grants_user_id_ends_at_idx
  ON public.Valdor_trial_grants (user_id, ends_at DESC);

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
  LEFT JOIN LATERAL (
    SELECT trial.started_at, trial.ends_at
    FROM public.Valdor_trial_grants trial
    WHERE trial.user_id = u.id
      AND trial.started_at <= now()
      AND trial.ends_at > now()
    ORDER BY trial.ends_at DESC, trial.started_at DESC
    LIMIT 1
  ) t ON true
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
