DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'payment_order_beneficiary_valid'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN payment_order_beneficiary_valid boolean;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'payment_order_beneficiary_bin'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN payment_order_beneficiary_bin text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'payment_order_beneficiary_account'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN payment_order_beneficiary_account text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'payment_order_beneficiary_name'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN payment_order_beneficiary_name text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'payment_ocr_original'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN payment_ocr_original jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'payment_final_data'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN payment_final_data jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'payment_manual_correction'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN payment_manual_correction boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'payment_corrected_fields'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN payment_corrected_fields jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'payment_verification_source'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN payment_verification_source text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'payment_verification_reason'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN payment_verification_reason text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_payment_corrected_fields_array_chk'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_payment_corrected_fields_array_chk
      CHECK (jsonb_typeof(payment_corrected_fields) = 'array');
  END IF;
END $$;
