/*
  # Add protocol numerator settings

  1. New table
    - `ref_protocol_numerator_settings`
  2. Purpose
    - Stores configurable starting number per course and protocol scope
    - Used for automatic protocol numbering across questionnaires
*/

CREATE TABLE IF NOT EXISTS ref_protocol_numerator_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name text NOT NULL DEFAULT '',
  category_scope text NOT NULL DEFAULT 'worker' CHECK (category_scope IN ('itr', 'worker', 'all')),
  start_number integer NOT NULL DEFAULT 1 CHECK (start_number >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ref_protocol_numerator_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ref_protocol_numerator_settings'
      AND policyname = 'Authenticated users can read protocol numerator settings'
  ) THEN
    CREATE POLICY "Authenticated users can read protocol numerator settings"
      ON ref_protocol_numerator_settings FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ref_protocol_numerator_settings'
      AND policyname = 'Authenticated users can insert protocol numerator settings'
  ) THEN
    CREATE POLICY "Authenticated users can insert protocol numerator settings"
      ON ref_protocol_numerator_settings FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ref_protocol_numerator_settings'
      AND policyname = 'Authenticated users can update protocol numerator settings'
  ) THEN
    CREATE POLICY "Authenticated users can update protocol numerator settings"
      ON ref_protocol_numerator_settings FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ref_protocol_numerator_settings'
      AND policyname = 'Authenticated users can delete protocol numerator settings'
  ) THEN
    CREATE POLICY "Authenticated users can delete protocol numerator settings"
      ON ref_protocol_numerator_settings FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_protocol_numerator_settings_unique
  ON ref_protocol_numerator_settings(course_name, category_scope);
