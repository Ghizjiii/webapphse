/*
  # Add questionnaire request type

  Stores whether a questionnaire is an external client request or an internal request.
*/

ALTER TABLE public.questionnaires
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'external';

ALTER TABLE public.questionnaires
  DROP CONSTRAINT IF EXISTS questionnaires_request_type_check;

UPDATE public.questionnaires
SET request_type = 'external'
WHERE request_type IS NULL OR request_type NOT IN ('external', 'internal');

ALTER TABLE public.questionnaires
  ADD CONSTRAINT questionnaires_request_type_check
  CHECK (request_type IN ('external', 'internal'));

CREATE INDEX IF NOT EXISTS idx_questionnaires_request_type
  ON public.questionnaires(request_type);
