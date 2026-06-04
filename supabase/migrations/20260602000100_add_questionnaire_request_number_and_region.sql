/*
  # Add questionnaire request numbers and region binding

  ## Changes
  1. Adds auto-generated unique request numbers for questionnaires
  2. Stores selected Bitrix region metadata on each questionnaire
  3. Backfills request numbers for existing questionnaires
*/

CREATE SEQUENCE IF NOT EXISTS public.questionnaires_request_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'questionnaires'
      AND column_name = 'request_number'
  ) THEN
    ALTER TABLE public.questionnaires
      ADD COLUMN request_number bigint;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'questionnaires'
      AND column_name = 'region_bitrix_item_id'
  ) THEN
    ALTER TABLE public.questionnaires
      ADD COLUMN region_bitrix_item_id text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'questionnaires'
      AND column_name = 'region_name'
  ) THEN
    ALTER TABLE public.questionnaires
      ADD COLUMN region_name text NOT NULL DEFAULT '';
  END IF;
END $$;

WITH current_state AS (
  SELECT COALESCE(MAX(request_number), 0) AS max_request_number
  FROM public.questionnaires
),
numbered_questionnaires AS (
  SELECT
    id,
    (SELECT max_request_number FROM current_state) +
      ROW_NUMBER() OVER (ORDER BY created_at NULLS FIRST, id) AS next_number
  FROM public.questionnaires
  WHERE request_number IS NULL
)
UPDATE public.questionnaires AS questionnaires
SET request_number = numbered_questionnaires.next_number
FROM numbered_questionnaires
WHERE questionnaires.id = numbered_questionnaires.id;

UPDATE public.questionnaires
SET title = CONCAT('Заявка №', request_number)
WHERE request_number IS NOT NULL
  AND COALESCE(BTRIM(title), '') = '';

ALTER TABLE public.questionnaires
  ALTER COLUMN request_number SET DEFAULT nextval('public.questionnaires_request_number_seq');

UPDATE public.questionnaires
SET request_number = nextval('public.questionnaires_request_number_seq')
WHERE request_number IS NULL;

ALTER TABLE public.questionnaires
  ALTER COLUMN request_number SET NOT NULL;

DO $$
DECLARE
  max_request_number bigint;
BEGIN
  SELECT MAX(request_number) INTO max_request_number
  FROM public.questionnaires;

  IF max_request_number IS NULL THEN
    PERFORM setval('public.questionnaires_request_number_seq', 1, false);
  ELSE
    PERFORM setval('public.questionnaires_request_number_seq', max_request_number, true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assign_questionnaire_request_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.request_number IS NULL THEN
    NEW.request_number := nextval('public.questionnaires_request_number_seq');
  END IF;

  NEW.region_bitrix_item_id := COALESCE(NEW.region_bitrix_item_id, '');
  NEW.region_name := COALESCE(BTRIM(NEW.region_name), '');

  IF COALESCE(BTRIM(NEW.title), '') = '' THEN
    NEW.title := CONCAT('Заявка №', NEW.request_number);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questionnaires_assign_request_fields ON public.questionnaires;

CREATE TRIGGER questionnaires_assign_request_fields
BEFORE INSERT ON public.questionnaires
FOR EACH ROW
EXECUTE FUNCTION public.assign_questionnaire_request_fields();

CREATE UNIQUE INDEX IF NOT EXISTS idx_questionnaires_request_number
  ON public.questionnaires(request_number);

CREATE INDEX IF NOT EXISTS idx_questionnaires_region_bitrix_item_id
  ON public.questionnaires(region_bitrix_item_id);
