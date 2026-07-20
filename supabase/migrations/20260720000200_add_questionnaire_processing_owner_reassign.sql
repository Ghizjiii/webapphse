CREATE OR REPLACE FUNCTION public.reassign_questionnaire_processing_owner(
  p_questionnaire_id uuid,
  p_processing_started_by uuid,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS public.questionnaires
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
  target_role text;
  current_row public.questionnaires%ROWTYPE;
  next_row public.questionnaires%ROWTYPE;
  now_value timestamptz := now();
  previous_owner_name text;
  next_owner_name text;
BEGIN
  SELECT role INTO actor_role
  FROM public.app_profiles
  WHERE user_id = p_actor_user_id
    AND is_active = true;

  IF actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only administrators can reassign questionnaire processing owner';
  END IF;

  SELECT role INTO target_role
  FROM public.app_profiles
  WHERE user_id = p_processing_started_by
    AND is_active = true;

  IF target_role NOT IN ('admin', 'coordinator') THEN
    RAISE EXCEPTION 'Processing owner must be an active coordinator or administrator';
  END IF;

  SELECT *
  INTO current_row
  FROM public.questionnaires
  WHERE id = p_questionnaire_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Questionnaire not found';
  END IF;

  IF current_row.submitted_at IS NULL THEN
    RAISE EXCEPTION 'Questionnaire has not been submitted yet';
  END IF;

  IF current_row.processing_started_at IS NULL THEN
    RAISE EXCEPTION 'Questionnaire processing has not been started yet';
  END IF;

  IF current_row.processing_started_by IS NOT DISTINCT FROM p_processing_started_by THEN
    RETURN current_row;
  END IF;

  SELECT COALESCE(NULLIF(full_name, ''), NULLIF(email, ''), current_row.processing_started_by::text)
  INTO previous_owner_name
  FROM public.app_profiles
  WHERE user_id = current_row.processing_started_by;

  SELECT COALESCE(NULLIF(full_name, ''), NULLIF(email, ''), p_processing_started_by::text)
  INTO next_owner_name
  FROM public.app_profiles
  WHERE user_id = p_processing_started_by;

  UPDATE public.questionnaires
  SET
    processing_started_by = p_processing_started_by,
    accepted_by = COALESCE(accepted_by, p_processing_started_by),
    updated_at = now_value
  WHERE id = p_questionnaire_id
  RETURNING * INTO next_row;

  PERFORM public.log_questionnaire_event(
    p_questionnaire_id,
    'processing_owner_changed',
    current_row.workflow_status,
    next_row.workflow_status,
    p_actor_user_id,
    COALESCE(next_row.is_overdue, false),
    next_row.sla_due_at,
    jsonb_build_object(
      'previous_processing_started_by', current_row.processing_started_by,
      'previous_processing_started_by_name', previous_owner_name,
      'next_processing_started_by', p_processing_started_by,
      'next_processing_started_by_name', next_owner_name
    )
  );

  RETURN next_row;
END;
$$;

NOTIFY pgrst, 'reload schema';
