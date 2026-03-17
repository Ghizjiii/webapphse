/*
  Add price field for certificates (Bitrix UF_CRM_12_1773257578)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'certificates'
      AND column_name = 'price'
  ) THEN
    ALTER TABLE certificates ADD COLUMN price numeric NULL;
  END IF;
END $$;

