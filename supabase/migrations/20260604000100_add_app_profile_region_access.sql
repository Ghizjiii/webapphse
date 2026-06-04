/*
  # Add app user region and questionnaire access scope

  Adds department/region binding to application profiles, introduces a
  department head role, and stores whether a user can see only own
  questionnaires or all questionnaires.
*/

ALTER TABLE public.app_profiles
  DROP CONSTRAINT IF EXISTS app_profiles_role_check;

ALTER TABLE public.app_profiles
  ADD CONSTRAINT app_profiles_role_check
  CHECK (role IN ('admin', 'coordinator', 'department_head', 'user'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_profiles'
      AND column_name = 'region_bitrix_item_id'
  ) THEN
    ALTER TABLE public.app_profiles
      ADD COLUMN region_bitrix_item_id text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_profiles'
      AND column_name = 'region_name'
  ) THEN
    ALTER TABLE public.app_profiles
      ADD COLUMN region_name text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_profiles'
      AND column_name = 'questionnaire_access'
  ) THEN
    ALTER TABLE public.app_profiles
      ADD COLUMN questionnaire_access text NOT NULL DEFAULT 'own';
  END IF;
END $$;

ALTER TABLE public.app_profiles
  DROP CONSTRAINT IF EXISTS app_profiles_questionnaire_access_check;

ALTER TABLE public.app_profiles
  ADD CONSTRAINT app_profiles_questionnaire_access_check
  CHECK (questionnaire_access IN ('own', 'all'));

UPDATE public.app_profiles
SET
  questionnaire_access = CASE WHEN role = 'admin' THEN 'all' ELSE COALESCE(NULLIF(questionnaire_access, ''), 'own') END,
  region_bitrix_item_id = COALESCE(region_bitrix_item_id, ''),
  region_name = COALESCE(BTRIM(region_name), ''),
  updated_at = now();

CREATE INDEX IF NOT EXISTS idx_app_profiles_region_bitrix_item_id
  ON public.app_profiles(region_bitrix_item_id);

CREATE INDEX IF NOT EXISTS idx_app_profiles_questionnaire_access
  ON public.app_profiles(questionnaire_access);
