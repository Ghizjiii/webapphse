/*
  # Add reference table for default course prices

  1. New table
    - `ref_course_prices`
      - `bitrix_item_id` - source Bitrix list item id
      - `name` - original Bitrix element title
      - `course_name` - linked course title
      - `qualification` - linked qualification title
      - `category` - linked category title
      - `price` - default price in тенге
      - `sort_order` - display order

  2. Security
    - Authenticated users can manage records
    - Anon users can read records
*/

CREATE TABLE IF NOT EXISTS ref_course_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bitrix_item_id text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  course_name text NOT NULL DEFAULT '',
  qualification text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  price numeric NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ref_course_prices_sort
  ON ref_course_prices (sort_order, course_name, category, qualification);

ALTER TABLE ref_course_prices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_course_prices'
      AND policyname = 'Authenticated users can read course prices'
  ) THEN
    CREATE POLICY "Authenticated users can read course prices"
      ON ref_course_prices FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_course_prices'
      AND policyname = 'Authenticated users can insert course prices'
  ) THEN
    CREATE POLICY "Authenticated users can insert course prices"
      ON ref_course_prices FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_course_prices'
      AND policyname = 'Authenticated users can update course prices'
  ) THEN
    CREATE POLICY "Authenticated users can update course prices"
      ON ref_course_prices FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_course_prices'
      AND policyname = 'Authenticated users can delete course prices'
  ) THEN
    CREATE POLICY "Authenticated users can delete course prices"
      ON ref_course_prices FOR DELETE
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_course_prices'
      AND policyname = 'Public can read course prices'
  ) THEN
    CREATE POLICY "Public can read course prices"
      ON ref_course_prices FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;
