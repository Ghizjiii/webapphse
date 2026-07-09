/*
  # Add participant full name

  Keeps the original split name columns for legacy records, but stores new
  submissions exactly as entered by clients and coordinators.
*/

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';

UPDATE public.participants
SET full_name = trim(concat_ws(' ', nullif(last_name, ''), nullif(first_name, ''), nullif(patronymic, '')))
WHERE coalesce(full_name, '') = ''
  AND trim(concat_ws(' ', nullif(last_name, ''), nullif(first_name, ''), nullif(patronymic, ''))) <> '';
