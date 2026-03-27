/*
  # Persist Bitrix sync keys for file/photo fields

  1. `deals.payment_file_sync_key`
     - Stores the local source key of the payment file last synced to Bitrix
     - Prevents re-uploading the same payment order when only other deal fields change

  2. `certificates.photo_sync_key`
     - Stores the participant photo URL last synced to Bitrix
     - Prevents re-uploading unchanged photos while still allowing photo refresh on URL change
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'payment_file_sync_key'
  ) THEN
    ALTER TABLE deals ADD COLUMN payment_file_sync_key text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'photo_sync_key'
  ) THEN
    ALTER TABLE certificates ADD COLUMN photo_sync_key text NOT NULL DEFAULT '';
  END IF;
END $$;
