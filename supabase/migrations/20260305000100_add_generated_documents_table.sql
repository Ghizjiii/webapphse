/*
  # Add generated_documents table for printable certificates/id cards

  ## Changes
  1. Create table `generated_documents` to store links and metadata for generated files
  2. Add FK links to questionnaires/certificates/companies/participants/deals
  3. Add RLS + authenticated CRUD policies
  4. Add useful indexes for questionnaire and certificate lookups
*/

CREATE TABLE IF NOT EXISTS generated_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  certificate_id uuid REFERENCES certificates(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  bitrix_item_id text,
  doc_type text NOT NULL CHECK (doc_type IN ('certificate', 'id_card')),
  template_name text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_url text NOT NULL DEFAULT '',
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'generated_documents'
      AND policyname = 'Authenticated users can read generated_documents'
  ) THEN
    CREATE POLICY "Authenticated users can read generated_documents"
      ON generated_documents FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'generated_documents'
      AND policyname = 'Authenticated users can insert generated_documents'
  ) THEN
    CREATE POLICY "Authenticated users can insert generated_documents"
      ON generated_documents FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'generated_documents'
      AND policyname = 'Authenticated users can update generated_documents'
  ) THEN
    CREATE POLICY "Authenticated users can update generated_documents"
      ON generated_documents FOR UPDATE
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
      AND tablename = 'generated_documents'
      AND policyname = 'Authenticated users can delete generated_documents'
  ) THEN
    CREATE POLICY "Authenticated users can delete generated_documents"
      ON generated_documents FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_generated_documents_questionnaire_id
  ON generated_documents(questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_generated_documents_certificate_id
  ON generated_documents(certificate_id);

CREATE INDEX IF NOT EXISTS idx_generated_documents_generated_at
  ON generated_documents(generated_at DESC);
