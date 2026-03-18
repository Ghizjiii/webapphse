/*
  Add payment status flag for coordinator verification in questionnaire company card.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'companies'
      AND column_name = 'payment_is_paid'
  ) THEN
    ALTER TABLE companies
      ADD COLUMN payment_is_paid boolean NOT NULL DEFAULT false;
  END IF;
END $$;

