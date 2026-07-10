/*
  # Add certificate full name

  Stores the unified participant full name on certificate rows while keeping legacy
  last_name/first_name/middle_name columns for old records and Bitrix compatibility.
*/

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';

UPDATE public.certificates c
SET full_name = COALESCE(NULLIF(trim(p.full_name), ''), trim(concat_ws(' ', p.last_name, p.first_name, p.patronymic)))
FROM public.participants p
WHERE c.participant_id = p.id
  AND COALESCE(NULLIF(trim(c.full_name), ''), '') = ''
  AND COALESCE(NULLIF(trim(p.full_name), ''), trim(concat_ws(' ', p.last_name, p.first_name, p.patronymic))) <> '';
