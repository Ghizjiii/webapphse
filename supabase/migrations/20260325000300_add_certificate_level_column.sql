/*
  # Add level column for certificates

  1. Schema
    - Add `level` text column to `certificates`
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'certificates'
      AND column_name = 'level'
  ) THEN
    ALTER TABLE certificates ADD COLUMN level text DEFAULT '';
  END IF;
END $$;
