/*
  # Company Directory + Contract Snapshot

  1. New table: ref_company_directory
     - Synced from Bitrix companies + smart-process contracts (entityTypeId 1060)
     - Used by public form lookup by BIN/IIN

  2. Extend companies table
     - Contract snapshot fields
     - "No contract" flag
     - Payment-order attachment fields

  3. Security
     - Authenticated users: full access to ref_company_directory
     - Public (anon): read-only access to ref_company_directory
*/

CREATE TABLE IF NOT EXISTS ref_company_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bitrix_company_id text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  bin_iin text NOT NULL DEFAULT '',
  bin_iin_digits text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  has_contract boolean NOT NULL DEFAULT false,
  contract_count integer NOT NULL DEFAULT 0,
  contract_bitrix_id text NOT NULL DEFAULT '',
  contract_title text NOT NULL DEFAULT '',
  contract_number text NOT NULL DEFAULT '',
  contract_date date,
  contract_start date,
  contract_end date,
  contract_status text NOT NULL DEFAULT '',
  contract_is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ref_company_directory_bin_digits
  ON ref_company_directory(bin_iin_digits);

CREATE INDEX IF NOT EXISTS idx_ref_company_directory_contract_active
  ON ref_company_directory(contract_is_active);

ALTER TABLE ref_company_directory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_company_directory'
      AND policyname = 'Authenticated users can read company directory'
  ) THEN
    CREATE POLICY "Authenticated users can read company directory"
      ON ref_company_directory FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_company_directory'
      AND policyname = 'Authenticated users can insert company directory'
  ) THEN
    CREATE POLICY "Authenticated users can insert company directory"
      ON ref_company_directory FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_company_directory'
      AND policyname = 'Authenticated users can update company directory'
  ) THEN
    CREATE POLICY "Authenticated users can update company directory"
      ON ref_company_directory FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_company_directory'
      AND policyname = 'Authenticated users can delete company directory'
  ) THEN
    CREATE POLICY "Authenticated users can delete company directory"
      ON ref_company_directory FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ref_company_directory'
      AND policyname = 'Public can read company directory'
  ) THEN
    CREATE POLICY "Public can read company directory"
      ON ref_company_directory FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'source_ref_company_id'
  ) THEN
    ALTER TABLE companies
      ADD COLUMN source_ref_company_id uuid REFERENCES ref_company_directory(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'has_contract'
  ) THEN
    ALTER TABLE companies ADD COLUMN has_contract boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'contract_bitrix_id'
  ) THEN
    ALTER TABLE companies ADD COLUMN contract_bitrix_id text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'contract_title'
  ) THEN
    ALTER TABLE companies ADD COLUMN contract_title text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'contract_number'
  ) THEN
    ALTER TABLE companies ADD COLUMN contract_number text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'contract_date'
  ) THEN
    ALTER TABLE companies ADD COLUMN contract_date date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'contract_start'
  ) THEN
    ALTER TABLE companies ADD COLUMN contract_start date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'contract_end'
  ) THEN
    ALTER TABLE companies ADD COLUMN contract_end date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'contract_status'
  ) THEN
    ALTER TABLE companies ADD COLUMN contract_status text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'contract_is_active'
  ) THEN
    ALTER TABLE companies ADD COLUMN contract_is_active boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'no_contract_confirmed'
  ) THEN
    ALTER TABLE companies ADD COLUMN no_contract_confirmed boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'payment_order_url'
  ) THEN
    ALTER TABLE companies ADD COLUMN payment_order_url text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'payment_order_name'
  ) THEN
    ALTER TABLE companies ADD COLUMN payment_order_name text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'payment_order_uploaded_at'
  ) THEN
    ALTER TABLE companies ADD COLUMN payment_order_uploaded_at timestamptz;
  END IF;
END $$;
