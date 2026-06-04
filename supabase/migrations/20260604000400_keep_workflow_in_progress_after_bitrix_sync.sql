/*
  # Keep questionnaire workflow in progress after Bitrix sync

  Bitrix synchronization starts processing, but must not complete the request.
  This helper also cleans up completion events left by older deployed sync code.
*/

CREATE OR REPLACE FUNCTION public.keep_questionnaire_in_progress_after_bitrix_sync(
  p_questionnaire_id uuid,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS public.questionnaires
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.questionnaires%ROWTYPE;
  next_row public.questionnaires%ROWTYPE;
  now_value timestamptz := now();
  started_at timestamptz;
  event_exists boolean;
BEGIN
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

  started_at := COALESCE(current_row.processing_started_at, now_value);

  UPDATE public.questionnaires
  SET
    workflow_status = 'in_progress',
    accepted_at = COALESCE(accepted_at, started_at),
    accepted_by = COALESCE(accepted_by, p_actor_user_id),
    processing_started_at = started_at,
    processing_started_by = COALESCE(processing_started_by, p_actor_user_id),
    completed_at = NULL,
    completed_by = NULL,
    completed_in_time = NULL,
    total_processing_seconds = NULL,
    current_stage_started_at = started_at,
    sla_due_at = started_at + interval '24 hours',
    is_overdue = CASE
      WHEN now_value > started_at + interval '24 hours' THEN true
      ELSE false
    END,
    overdue_at = CASE
      WHEN now_value > started_at + interval '24 hours' THEN COALESCE(overdue_at, started_at + interval '24 hours')
      ELSE NULL
    END,
    updated_at = now_value
  WHERE id = p_questionnaire_id
  RETURNING * INTO next_row;

  DELETE FROM public.questionnaire_events
  WHERE questionnaire_id = p_questionnaire_id
    AND event_type = 'completed';

  SELECT EXISTS (
    SELECT 1
    FROM public.questionnaire_events
    WHERE questionnaire_id = p_questionnaire_id
      AND event_type = 'processing_started'
  ) INTO event_exists;

  IF NOT event_exists THEN
    PERFORM public.log_questionnaire_event(
      p_questionnaire_id,
      'processing_started',
      COALESCE(current_row.workflow_status, 'accepted'),
      'in_progress',
      p_actor_user_id,
      COALESCE(next_row.is_overdue, false),
      next_row.sla_due_at,
      jsonb_build_object('source', 'bitrix_sync_cleanup')
    );
  END IF;

  RETURN next_row;
END;
$$;
