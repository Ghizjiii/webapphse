ALTER TABLE public.questionnaires
  ADD COLUMN IF NOT EXISTS is_general_contractor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS object_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_questionnaires_is_general_contractor
  ON public.questionnaires(is_general_contractor);

CREATE INDEX IF NOT EXISTS idx_questionnaires_object_name
  ON public.questionnaires(object_name);
