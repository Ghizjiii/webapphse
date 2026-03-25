DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'questionnaires'
      AND column_name = 'payment_order_optional'
  ) THEN
    ALTER TABLE questionnaires
      ADD COLUMN payment_order_optional boolean NOT NULL DEFAULT false;
  END IF;
END $$;
