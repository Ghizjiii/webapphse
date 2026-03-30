/*
  # Add app user profiles and synced Bitrix employees

  1. New tables
    - `app_profiles`
      - stores app-specific role and Bitrix mapping for authenticated users
    - `bitrix_employees`
      - local cache of Bitrix24 employees for admin mapping UI

  2. Security
    - `app_profiles`
      - authenticated users can read their own profile
      - admins can read/manage all profiles
    - `bitrix_employees`
      - admins can read/manage synced employees

  3. Bootstrap
    - backfill existing auth users into `app_profiles` as `admin`
      because the current app effectively has a single privileged user model
*/

CREATE TABLE IF NOT EXISTS public.app_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'coordinator' CHECK (role IN ('admin', 'coordinator', 'user')),
  is_active boolean NOT NULL DEFAULT true,
  bitrix_user_id text NOT NULL DEFAULT '',
  bitrix_user_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_profiles_role
  ON public.app_profiles(role);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_profiles_bitrix_user_id
  ON public.app_profiles(bitrix_user_id)
  WHERE bitrix_user_id <> '';

CREATE TABLE IF NOT EXISTS public.bitrix_employees (
  bitrix_user_id text PRIMARY KEY,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  work_position text NOT NULL DEFAULT '',
  department_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bitrix_employees_active
  ON public.bitrix_employees(active);

CREATE INDEX IF NOT EXISTS idx_bitrix_employees_email
  ON public.bitrix_employees(email);

ALTER TABLE public.app_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitrix_employees ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.app_profiles WHERE user_id = auth.uid()),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.is_current_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_app_role() = 'admin';
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_profiles'
      AND policyname = 'Users can read own profile or admins can read all profiles'
  ) THEN
    CREATE POLICY "Users can read own profile or admins can read all profiles"
      ON public.app_profiles FOR SELECT
      TO authenticated
      USING (user_id = auth.uid() OR public.is_current_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_profiles'
      AND policyname = 'Admins can insert app profiles'
  ) THEN
    CREATE POLICY "Admins can insert app profiles"
      ON public.app_profiles FOR INSERT
      TO authenticated
      WITH CHECK (public.is_current_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_profiles'
      AND policyname = 'Admins can update app profiles'
  ) THEN
    CREATE POLICY "Admins can update app profiles"
      ON public.app_profiles FOR UPDATE
      TO authenticated
      USING (public.is_current_admin())
      WITH CHECK (public.is_current_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_profiles'
      AND policyname = 'Admins can delete app profiles'
  ) THEN
    CREATE POLICY "Admins can delete app profiles"
      ON public.app_profiles FOR DELETE
      TO authenticated
      USING (public.is_current_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bitrix_employees'
      AND policyname = 'Admins can read bitrix employees'
  ) THEN
    CREATE POLICY "Admins can read bitrix employees"
      ON public.bitrix_employees FOR SELECT
      TO authenticated
      USING (public.is_current_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bitrix_employees'
      AND policyname = 'Admins can insert bitrix employees'
  ) THEN
    CREATE POLICY "Admins can insert bitrix employees"
      ON public.bitrix_employees FOR INSERT
      TO authenticated
      WITH CHECK (public.is_current_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bitrix_employees'
      AND policyname = 'Admins can update bitrix employees'
  ) THEN
    CREATE POLICY "Admins can update bitrix employees"
      ON public.bitrix_employees FOR UPDATE
      TO authenticated
      USING (public.is_current_admin())
      WITH CHECK (public.is_current_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bitrix_employees'
      AND policyname = 'Admins can delete bitrix employees'
  ) THEN
    CREATE POLICY "Admins can delete bitrix employees"
      ON public.bitrix_employees FOR DELETE
      TO authenticated
      USING (public.is_current_admin());
  END IF;
END $$;

INSERT INTO public.app_profiles (
  user_id,
  email,
  full_name,
  role,
  is_active
)
SELECT
  users.id,
  COALESCE(users.email, ''),
  COALESCE(users.raw_user_meta_data ->> 'full_name', ''),
  'admin',
  true
FROM auth.users AS users
ON CONFLICT (user_id) DO UPDATE
SET
  email = EXCLUDED.email,
  updated_at = now();
