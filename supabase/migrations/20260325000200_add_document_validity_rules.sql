/*
  # Add document validity reference rules

  1. New table
    - `ref_document_validity_rules`
      - `course_name` - course title
      - `category` - employee category
      - `document_type` - certificate / ID metadata for reference
      - `duration_value` - rule value
      - `duration_unit` - day / month / year
      - `sort_order` - manual display order

  2. Security
    - Authenticated users can manage rules
    - Authenticated users can read rules
*/

CREATE TABLE IF NOT EXISTS ref_document_validity_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name text NOT NULL,
  category text NOT NULL,
  document_type text NOT NULL DEFAULT '',
  duration_value integer NOT NULL CHECK (duration_value > 0),
  duration_unit text NOT NULL DEFAULT 'year' CHECK (duration_unit IN ('day', 'month', 'year')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_document_validity_rules_course_category_unique
  ON ref_document_validity_rules (lower(course_name), lower(category));

CREATE INDEX IF NOT EXISTS idx_ref_document_validity_rules_sort
  ON ref_document_validity_rules (sort_order, course_name, category);

ALTER TABLE ref_document_validity_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_document_validity_rules'
      AND policyname = 'Authenticated users can read document validity rules'
  ) THEN
    CREATE POLICY "Authenticated users can read document validity rules"
      ON ref_document_validity_rules FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_document_validity_rules'
      AND policyname = 'Authenticated users can insert document validity rules'
  ) THEN
    CREATE POLICY "Authenticated users can insert document validity rules"
      ON ref_document_validity_rules FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_document_validity_rules'
      AND policyname = 'Authenticated users can update document validity rules'
  ) THEN
    CREATE POLICY "Authenticated users can update document validity rules"
      ON ref_document_validity_rules FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_document_validity_rules'
      AND policyname = 'Authenticated users can delete document validity rules'
  ) THEN
    CREATE POLICY "Authenticated users can delete document validity rules"
      ON ref_document_validity_rules FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;
