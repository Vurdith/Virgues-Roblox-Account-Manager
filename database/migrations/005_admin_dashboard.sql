-- Owner-only administration for complimentary Pro access.
-- The whitelist stores immutable Neon Auth user IDs, not email addresses.

CREATE TABLE IF NOT EXISTS public.Valdor_admins (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.Valdor_trial_grants
  ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES public.Valdor_admins(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 280);

CREATE INDEX IF NOT EXISTS Valdor_trial_grants_granted_by_idx
  ON public.Valdor_trial_grants (granted_by);

-- Seed the first owner by resolving the requested email to its Neon Auth ID.
-- If the account does not exist yet, rerun this insert after the account is created.
INSERT INTO public.Valdor_admins (user_id)
SELECT id
FROM neon_auth."user"
WHERE lower(email) = lower('reeceleneveu@gmail.com')
ON CONFLICT (user_id) DO NOTHING;
