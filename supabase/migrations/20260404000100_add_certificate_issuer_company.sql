/*
  # Add issuer company field for certificates

  1. Schema
    - Add `issuer_company` text column to `certificates`
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'certificates'
      AND column_name = 'issuer_company'
  ) THEN
    ALTER TABLE certificates ADD COLUMN issuer_company text DEFAULT '';
  END IF;
END $$;
