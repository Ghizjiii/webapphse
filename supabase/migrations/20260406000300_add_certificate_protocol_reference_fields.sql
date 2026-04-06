/*
  # Add protocol helper reference fields to certificates

  1. Schema
    - Add `commission_members_protocol` text column to `certificates`
    - Add `electrical_safety_admission_protocol` text column to `certificates`
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'certificates'
      AND column_name = 'commission_members_protocol'
  ) THEN
    ALTER TABLE certificates ADD COLUMN commission_members_protocol text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'certificates'
      AND column_name = 'electrical_safety_admission_protocol'
  ) THEN
    ALTER TABLE certificates ADD COLUMN electrical_safety_admission_protocol text DEFAULT '';
  END IF;
END $$;
