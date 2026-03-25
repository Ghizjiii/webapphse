/*
  # Add Bitrix list-backed certificate columns

  1. Schema
    - Add `marker_pass`, `type_learn`, `commis_concl`, `grade` text columns to `certificates`
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'certificates'
      AND column_name = 'marker_pass'
  ) THEN
    ALTER TABLE certificates ADD COLUMN marker_pass text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'certificates'
      AND column_name = 'type_learn'
  ) THEN
    ALTER TABLE certificates ADD COLUMN type_learn text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'certificates'
      AND column_name = 'commis_concl'
  ) THEN
    ALTER TABLE certificates ADD COLUMN commis_concl text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'certificates'
      AND column_name = 'grade'
  ) THEN
    ALTER TABLE certificates ADD COLUMN grade text DEFAULT '';
  END IF;
END $$;
