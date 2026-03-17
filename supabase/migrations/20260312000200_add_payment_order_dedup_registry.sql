/*
  # Payment order deduplication by business keys

  1. Extend `companies` with payment-order metadata fields
     - payment_order_number (text)
     - payment_order_date (date)
     - payment_order_amount (numeric)

  2. Create `payment_order_registry`
     - Stores normalized business keys for dedupe checks
     - Unique key: (company_bin_digits, payment_order_number_norm, payment_order_date, payment_order_amount)
     - Unique per questionnaire to allow safe resubmits/edit

  3. RLS policies
     - Authenticated users: full access
     - Anon: insert/update only via active questionnaire
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'payment_order_number'
  ) THEN
    ALTER TABLE companies ADD COLUMN payment_order_number text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'payment_order_date'
  ) THEN
    ALTER TABLE companies ADD COLUMN payment_order_date date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'payment_order_amount'
  ) THEN
    ALTER TABLE companies ADD COLUMN payment_order_amount numeric(14,2);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payment_order_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  company_bin_digits text NOT NULL,
  payment_order_number text NOT NULL,
  payment_order_number_norm text GENERATED ALWAYS AS (
    regexp_replace(lower(payment_order_number), '[^a-zа-я0-9]+', '', 'g')
  ) STORED,
  payment_order_date date NOT NULL,
  payment_order_amount numeric(14,2) NOT NULL,
  payment_order_url text NOT NULL DEFAULT '',
  payment_order_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_order_registry_company_bin_digits_check CHECK (char_length(company_bin_digits) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_order_registry_business_key
  ON payment_order_registry (company_bin_digits, payment_order_number_norm, payment_order_date, payment_order_amount);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_order_registry_questionnaire
  ON payment_order_registry (questionnaire_id);

ALTER TABLE payment_order_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_order_registry'
      AND policyname = 'Authenticated users can manage payment registry'
  ) THEN
    CREATE POLICY "Authenticated users can manage payment registry"
      ON payment_order_registry
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_order_registry'
      AND policyname = 'Public can insert payment registry via active questionnaire'
  ) THEN
    CREATE POLICY "Public can insert payment registry via active questionnaire"
      ON payment_order_registry
      FOR INSERT
      TO anon
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = payment_order_registry.questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_order_registry'
      AND policyname = 'Public can update payment registry via active questionnaire'
  ) THEN
    CREATE POLICY "Public can update payment registry via active questionnaire"
      ON payment_order_registry
      FOR UPDATE
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = payment_order_registry.questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = payment_order_registry.questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;
