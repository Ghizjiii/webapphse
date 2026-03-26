/*
  # Add protocols table for grouped protocol generation

  1. New table
    - `protocols`
  2. Purpose
    - Stores one protocol row per questionnaire/course/template/category scope
    - Keeps generated file link and Bitrix smart-process 1070 item binding
*/

CREATE TABLE IF NOT EXISTS protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  bitrix_item_id text NOT NULL DEFAULT '',
  template_key text NOT NULL DEFAULT '',
  template_name text NOT NULL DEFAULT '',
  course_name text NOT NULL DEFAULT '',
  category_scope text NOT NULL DEFAULT 'all' CHECK (category_scope IN ('itr', 'worker', 'all')),
  category_label text NOT NULL DEFAULT '',
  protocol_number text NOT NULL DEFAULT '',
  protocol_date date,
  employees_count integer NOT NULL DEFAULT 0,
  file_id text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_url text NOT NULL DEFAULT '',
  is_printed boolean NOT NULL DEFAULT false,
  generated_at timestamptz,
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error')),
  sync_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'protocols'
      AND policyname = 'Authenticated users can read protocols'
  ) THEN
    CREATE POLICY "Authenticated users can read protocols"
      ON protocols FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'protocols'
      AND policyname = 'Authenticated users can insert protocols'
  ) THEN
    CREATE POLICY "Authenticated users can insert protocols"
      ON protocols FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'protocols'
      AND policyname = 'Authenticated users can update protocols'
  ) THEN
    CREATE POLICY "Authenticated users can update protocols"
      ON protocols FOR UPDATE
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
      AND tablename = 'protocols'
      AND policyname = 'Authenticated users can delete protocols'
  ) THEN
    CREATE POLICY "Authenticated users can delete protocols"
      ON protocols FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_protocols_unique_group
  ON protocols(questionnaire_id, template_key, course_name, category_scope);

CREATE INDEX IF NOT EXISTS idx_protocols_questionnaire_id
  ON protocols(questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_protocols_generated_at
  ON protocols(generated_at DESC NULLS LAST);
