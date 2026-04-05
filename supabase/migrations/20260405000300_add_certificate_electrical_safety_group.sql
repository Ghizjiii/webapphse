/*
  # Add electrical safety group to certificates

  1. Changes
    - Adds `electrical_safety_group` text column to `certificates`
    - Keeps empty string as default for existing rows and new inserts
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'certificates'
      AND column_name = 'electrical_safety_group'
  ) THEN
    ALTER TABLE certificates ADD COLUMN electrical_safety_group text DEFAULT '';
  END IF;
END $$;
