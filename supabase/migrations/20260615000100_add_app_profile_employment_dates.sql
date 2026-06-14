/*
  # Add employment dates to application profiles

  Stores when an application user was registered and, if applicable, when
  the employee was dismissed. Dismissed users remain in app_profiles so their
  historical assignments and Bitrix mapping are preserved.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_profiles'
      AND column_name = 'registered_at'
  ) THEN
    ALTER TABLE public.app_profiles
      ADD COLUMN registered_at date;
  END IF;
END $$;

ALTER TABLE public.app_profiles
  ALTER COLUMN registered_at SET DEFAULT CURRENT_DATE;

UPDATE public.app_profiles
SET registered_at = COALESCE(registered_at, created_at::date, CURRENT_DATE)
WHERE registered_at IS NULL;

ALTER TABLE public.app_profiles
  ALTER COLUMN registered_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_profiles'
      AND column_name = 'dismissed_at'
  ) THEN
    ALTER TABLE public.app_profiles
      ADD COLUMN dismissed_at date;
  END IF;
END $$;

UPDATE public.app_profiles
SET dismissed_at = COALESCE(dismissed_at, updated_at::date, CURRENT_DATE)
WHERE is_active = false
  AND dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_profiles_registered_at
  ON public.app_profiles(registered_at);

CREATE INDEX IF NOT EXISTS idx_app_profiles_dismissed_at
  ON public.app_profiles(dismissed_at)
  WHERE dismissed_at IS NOT NULL;
