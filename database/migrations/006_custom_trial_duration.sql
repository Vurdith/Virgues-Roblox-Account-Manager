-- Store the operator-selected trial amount and unit while keeping
-- duration_days for compatibility with existing reporting and clients.

ALTER TABLE public.virgue_trial_grants
  ADD COLUMN IF NOT EXISTS duration_value integer,
  ADD COLUMN IF NOT EXISTS duration_unit text;

UPDATE public.virgue_trial_grants
SET duration_value = COALESCE(duration_value, duration_days),
    duration_unit = COALESCE(duration_unit, 'day')
WHERE duration_value IS NULL OR duration_unit IS NULL;

ALTER TABLE public.virgue_trial_grants
  ALTER COLUMN duration_value SET DEFAULT 14,
  ALTER COLUMN duration_unit SET DEFAULT 'day',
  ALTER COLUMN duration_value SET NOT NULL,
  ALTER COLUMN duration_unit SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'virgue_trial_grants_duration_value_check'
  ) THEN
    ALTER TABLE public.virgue_trial_grants
      ADD CONSTRAINT virgue_trial_grants_duration_value_check CHECK (duration_value > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'virgue_trial_grants_duration_unit_check'
  ) THEN
    ALTER TABLE public.virgue_trial_grants
      ADD CONSTRAINT virgue_trial_grants_duration_unit_check
      CHECK (duration_unit IN ('minute', 'hour', 'day', 'week'));
  END IF;
END $$;
