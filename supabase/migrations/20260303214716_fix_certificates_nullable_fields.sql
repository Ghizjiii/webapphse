/*
  # Fix certificates and participants nullable fields
  
  ## Changes
  - Make certificates.course_id nullable (courses stored as text)
  - Make certificates.participant_id nullable
  - Make participants.company_id nullable
  - Drop participants_company_id NOT NULL constraint if any
*/

DO $$
BEGIN
  ALTER TABLE certificates ALTER COLUMN course_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE certificates ALTER COLUMN participant_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE participants ALTER COLUMN company_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
