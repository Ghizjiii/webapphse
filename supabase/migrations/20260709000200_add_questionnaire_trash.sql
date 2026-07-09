ALTER TABLE public.questionnaires
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_previous_is_active boolean,
  ADD COLUMN IF NOT EXISTS bitrix_deal_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS bitrix_deal_delete_error text;

CREATE INDEX IF NOT EXISTS idx_questionnaires_deleted_at
  ON public.questionnaires(deleted_at);

CREATE INDEX IF NOT EXISTS idx_questionnaires_deleted_by
  ON public.questionnaires(deleted_by)
  WHERE deleted_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.purge_deleted_questionnaires(p_before timestamptz DEFAULT now() - interval '30 days')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  DELETE FROM public.questionnaires
  WHERE deleted_at IS NOT NULL
    AND deleted_at < p_before;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
