ALTER TABLE public.questionnaires
  ADD COLUMN IF NOT EXISTS engineer_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_questionnaires_engineer_name
  ON public.questionnaires (engineer_name);

CREATE OR REPLACE FUNCTION public.prevent_department_head_questionnaire_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND public.current_app_role() = 'department_head' THEN
    RAISE EXCEPTION 'Department heads have read-only access to questionnaires'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_department_head_questionnaire_update ON public.questionnaires;
CREATE TRIGGER prevent_department_head_questionnaire_update
  BEFORE UPDATE OR DELETE ON public.questionnaires
  FOR EACH ROW EXECUTE FUNCTION public.prevent_department_head_questionnaire_mutation();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'companies',
    'participants',
    'participant_courses',
    'certificates',
    'protocols',
    'generated_documents',
    'deals',
    'payment_order_registry'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS prevent_department_head_mutation ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER prevent_department_head_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_department_head_questionnaire_mutation()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;
