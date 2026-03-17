/*
  Store uploaded payment order file location in Supabase Storage
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'payment_order_storage_bucket'
  ) THEN
    ALTER TABLE companies ADD COLUMN payment_order_storage_bucket text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'payment_order_storage_path'
  ) THEN
    ALTER TABLE companies ADD COLUMN payment_order_storage_path text NOT NULL DEFAULT '';
  END IF;
END $$;
