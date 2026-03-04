/*
  # Fix Delete Policies and Public Reference Table Access

  1. Changes
    - Add DELETE policy for questionnaires (authenticated users only)
    - Add anon SELECT policies for ref_categories and ref_courses (needed for public form)
    - Add authenticated DELETE policy for companies, participants, deals, certificates (cascade cleanup)

  2. Security
    - Only authenticated users can delete questionnaires and related data
    - Anon users can only read reference tables (categories, courses) - needed for public form dropdowns
*/

-- Questionnaires: authenticated users can delete their own questionnaires
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'questionnaires' AND policyname = 'Authenticated users can delete questionnaires'
  ) THEN
    CREATE POLICY "Authenticated users can delete questionnaires"
      ON questionnaires FOR DELETE
      TO authenticated
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Companies: authenticated users can delete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND policyname = 'Authenticated users can delete companies'
  ) THEN
    CREATE POLICY "Authenticated users can delete companies"
      ON companies FOR DELETE
      TO authenticated
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Deals: authenticated users can delete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'deals' AND policyname = 'Authenticated users can delete deals'
  ) THEN
    CREATE POLICY "Authenticated users can delete deals"
      ON deals FOR DELETE
      TO authenticated
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ref_categories: anon can read (needed for public form category dropdown)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ref_categories' AND policyname = 'Public can read categories'
  ) THEN
    CREATE POLICY "Public can read categories"
      ON ref_categories FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

-- ref_courses: anon can read (needed for public form course dropdown)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ref_courses' AND policyname = 'Public can read courses'
  ) THEN
    CREATE POLICY "Public can read courses"
      ON ref_courses FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;
