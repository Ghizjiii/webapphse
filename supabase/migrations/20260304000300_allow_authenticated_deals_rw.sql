/*
  # Allow authenticated users to read/insert/update deals

  Fixes RLS error when saving local deal after Bitrix deal creation.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'deals'
      AND policyname = 'Authenticated users can read deals'
  ) THEN
    CREATE POLICY "Authenticated users can read deals"
      ON deals FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'deals'
      AND policyname = 'Authenticated users can insert deals'
  ) THEN
    CREATE POLICY "Authenticated users can insert deals"
      ON deals FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'deals'
      AND policyname = 'Authenticated users can update deals'
  ) THEN
    CREATE POLICY "Authenticated users can update deals"
      ON deals FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;