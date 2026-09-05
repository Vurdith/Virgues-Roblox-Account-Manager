-- Add the first workspace limits to plans that may already exist from 001.
-- The desktop client currently resolves every user to Free until entitlement
-- lookup is connected to Neon Auth and subscriptions.

UPDATE public.Valdor_plans
SET
  features = jsonb_set(
    COALESCE(features, '{}'::jsonb),
    '{limits}',
    '{"maxAccounts":2,"maxGames":2}'::jsonb,
    true
  )
  || jsonb_build_object('bulkLaunch', false),
  updated_at = now()
WHERE plan_key = 'free';

UPDATE public.Valdor_plans
SET
  features = jsonb_set(
    COALESCE(features, '{}'::jsonb),
    '{limits}',
    '{"maxAccounts":null,"maxGames":null}'::jsonb,
    true
  )
  || jsonb_build_object('bulkLaunch', true),
  updated_at = now()
WHERE plan_key = 'pro';
