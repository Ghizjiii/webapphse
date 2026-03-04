/*
  # Allow authenticated users to read/insert/update/delete certificates

  Fixes RLS error during Bitrix sync:
  "new row violates row-level security policy for table 'certificates'"
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'certificates'
      AND policyname = 'Authenticated users can read certificates'
  ) THEN
    CREATE POLICY "Authenticated users can read certificates"
      ON certificates FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'certificates'
      AND policyname = 'Authenticated users can insert certificates'
  ) THEN
    CREATE POLICY "Authenticated users can insert certificates"
      ON certificates FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'certificates'
      AND policyname = 'Authenticated users can update certificates'
  ) THEN
    CREATE POLICY "Authenticated users can update certificates"
      ON certificates FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'certificates'
      AND policyname = 'Authenticated users can delete certificates'
  ) THEN
    CREATE POLICY "Authenticated users can delete certificates"
      ON certificates FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END
$$;
