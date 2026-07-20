/*
  Add optional public-form comments to company records.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'comments'
  ) THEN
    ALTER TABLE companies ADD COLUMN comments text NOT NULL DEFAULT '';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
