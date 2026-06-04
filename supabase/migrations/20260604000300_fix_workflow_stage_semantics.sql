/*
  # Fix questionnaire workflow stage semantics

  - Prevent duplicate no-op history events such as accepted -> accepted
  - Start SLA only when processing starts, not when the client submits or the
    coordinator opens the questionnaire
  - Keep Bitrix sync as the processing start, while completion remains a manual
    coordinator action
*/

CREATE OR REPLACE FUNCTION public.sync_questionnaire_submission_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.submitted_at IS NOT NULL
    AND OLD.submitted_at IS NULL
    AND NEW.workflow_status = 'awaiting_submission'
  THEN
    NEW.workflow_status := 'submitted';
    NEW.current_stage_started_at := NEW.submitted_at;
    NEW.sla_due_at := NULL;
  END IF;

  IF NEW.workflow_status = 'completed' THEN
    NEW.sla_due_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_questionnaire_workflow(
  p_questionnaire_id uuid,
  p_next_status text,
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
  next_event text;
  was_overdue boolean;
BEGIN
  IF p_next_status NOT IN ('accepted', 'in_progress', 'completed', 'archived') THEN
    RAISE EXCEPTION 'Unsupported workflow status: %', p_next_status;
  END IF;

  SELECT *
  INTO current_row
  FROM public.questionnaires
  WHERE id = p_questionnaire_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Questionnaire not found';
  END IF;

  IF current_row.workflow_status = 'completed' AND p_next_status <> 'archived' THEN
    RETURN current_row;
  END IF;

  IF p_next_status = 'accepted' AND current_row.accepted_at IS NOT NULL THEN
    RETURN current_row;
  END IF;

  IF p_next_status = 'in_progress' AND current_row.processing_started_at IS NOT NULL THEN
    RETURN current_row;
  END IF;

  IF p_next_status = 'completed' AND current_row.completed_at IS NOT NULL THEN
    RETURN current_row;
  END IF;

  was_overdue := COALESCE(current_row.is_overdue, false)
    OR (
      current_row.processing_started_at IS NOT NULL
      AND current_row.sla_due_at IS NOT NULL
      AND now_value > current_row.sla_due_at
      AND current_row.workflow_status <> 'completed'
    );

  IF p_next_status = 'accepted' THEN
    IF current_row.submitted_at IS NULL THEN
      RAISE EXCEPTION 'Questionnaire has not been submitted yet';
    END IF;

    UPDATE public.questionnaires
    SET
      workflow_status = 'accepted',
      accepted_at = COALESCE(accepted_at, now_value),
      accepted_by = COALESCE(accepted_by, p_actor_user_id),
      current_stage_started_at = now_value,
      sla_due_at = NULL,
      updated_at = now_value
    WHERE id = p_questionnaire_id
    RETURNING * INTO next_row;

    next_event := 'accepted';
  ELSIF p_next_status = 'in_progress' THEN
    IF current_row.submitted_at IS NULL THEN
      RAISE EXCEPTION 'Questionnaire has not been submitted yet';
    END IF;

    UPDATE public.questionnaires
    SET
      workflow_status = 'in_progress',
      accepted_at = COALESCE(accepted_at, now_value),
      accepted_by = COALESCE(accepted_by, p_actor_user_id),
      processing_started_at = COALESCE(processing_started_at, now_value),
      processing_started_by = COALESCE(processing_started_by, p_actor_user_id),
      current_stage_started_at = now_value,
      sla_due_at = now_value + interval '24 hours',
      is_overdue = was_overdue,
      overdue_at = CASE WHEN was_overdue THEN COALESCE(overdue_at, now_value) ELSE overdue_at END,
      updated_at = now_value
    WHERE id = p_questionnaire_id
    RETURNING * INTO next_row;

    next_event := 'processing_started';
  ELSIF p_next_status = 'completed' THEN
    IF current_row.submitted_at IS NULL THEN
      RAISE EXCEPTION 'Questionnaire has not been submitted yet';
    END IF;

    IF current_row.processing_started_at IS NULL THEN
      RAISE EXCEPTION 'Questionnaire processing has not been started yet';
    END IF;

    UPDATE public.questionnaires
    SET
      workflow_status = 'completed',
      completed_at = COALESCE(completed_at, now_value),
      completed_by = COALESCE(completed_by, p_actor_user_id),
      is_overdue = was_overdue,
      overdue_at = CASE WHEN was_overdue THEN COALESCE(overdue_at, now_value) ELSE overdue_at END,
      completed_in_time = NOT was_overdue,
      total_processing_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now_value - submitted_at))::integer),
      current_stage_started_at = NULL,
      sla_due_at = NULL,
      updated_at = now_value
    WHERE id = p_questionnaire_id
    RETURNING * INTO next_row;

    next_event := 'completed';
  ELSE
    UPDATE public.questionnaires
    SET
      workflow_status = 'archived',
      updated_at = now_value
    WHERE id = p_questionnaire_id
    RETURNING * INTO next_row;

    next_event := 'archived';
  END IF;

  IF was_overdue AND current_row.is_overdue IS DISTINCT FROM true THEN
    PERFORM public.log_questionnaire_event(
      p_questionnaire_id,
      'overdue',
      current_row.workflow_status,
      current_row.workflow_status,
      p_actor_user_id,
      true,
      current_row.sla_due_at,
      jsonb_build_object('detected_during_transition', p_next_status)
    );
  END IF;

  PERFORM public.log_questionnaire_event(
    p_questionnaire_id,
    next_event,
    current_row.workflow_status,
    next_row.workflow_status,
    p_actor_user_id,
    COALESCE(next_row.is_overdue, false),
    next_row.sla_due_at,
    jsonb_build_object('previous_stage_started_at', current_row.current_stage_started_at)
  );

  RETURN next_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_overdue_questionnaires()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  overdue_row record;
  changed_count integer := 0;
BEGIN
  FOR overdue_row IN
    SELECT id, workflow_status, sla_due_at
    FROM public.questionnaires
    WHERE workflow_status IN ('in_progress')
      AND completed_at IS NULL
      AND is_overdue = false
      AND sla_due_at IS NOT NULL
      AND now() > sla_due_at
  LOOP
    UPDATE public.questionnaires
    SET
      workflow_status = 'overdue',
      is_overdue = true,
      overdue_at = now(),
      updated_at = now()
    WHERE id = overdue_row.id;

    PERFORM public.log_questionnaire_event(
      overdue_row.id,
      'overdue',
      overdue_row.workflow_status,
      'overdue',
      NULL,
      true,
      overdue_row.sla_due_at,
      jsonb_build_object('source', 'mark_overdue_questionnaires')
    );

    changed_count := changed_count + 1;
  END LOOP;

  RETURN changed_count;
END;
$$;

UPDATE public.questionnaires
SET
  workflow_status = CASE
    WHEN accepted_at IS NOT NULL THEN 'accepted'
    WHEN submitted_at IS NOT NULL THEN 'submitted'
    ELSE workflow_status
  END,
  sla_due_at = NULL,
  is_overdue = false,
  overdue_at = NULL,
  updated_at = now()
WHERE completed_at IS NULL
  AND processing_started_at IS NULL
  AND workflow_status IN ('submitted', 'accepted', 'overdue');

UPDATE public.questionnaires
SET
  workflow_status = CASE WHEN workflow_status = 'overdue' THEN 'overdue' ELSE 'in_progress' END,
  current_stage_started_at = COALESCE(processing_started_at, current_stage_started_at),
  sla_due_at = COALESCE(processing_started_at, current_stage_started_at, updated_at, now()) + interval '24 hours',
  updated_at = now()
WHERE completed_at IS NULL
  AND processing_started_at IS NOT NULL
  AND sla_due_at IS NULL;

DELETE FROM public.questionnaire_events
WHERE event_type IN ('accepted', 'processing_started', 'completed')
  AND from_status = to_status;
