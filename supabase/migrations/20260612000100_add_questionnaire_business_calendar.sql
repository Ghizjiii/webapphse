/*
  # Add questionnaire business calendar SLA

  Calculates questionnaire SLA deadlines in business time:
  - Monday-Friday
  - 09:00-18:00 in Asia/Qyzylorda
  - HR-provided holidays from ref_work_calendar_holidays
*/

CREATE TABLE IF NOT EXISTS public.ref_work_calendar_holidays (
  holiday_date date PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'HR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ref_work_calendar_holidays IS
  'HR-maintained non-working dates used by questionnaire SLA calculations.';

ALTER TABLE public.ref_work_calendar_holidays ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ref_work_calendar_holidays'
      AND policyname = 'Authenticated users can read work calendar holidays'
  ) THEN
    CREATE POLICY "Authenticated users can read work calendar holidays"
      ON public.ref_work_calendar_holidays FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ref_work_calendar_holidays'
      AND policyname = 'Authenticated users can insert work calendar holidays'
  ) THEN
    CREATE POLICY "Authenticated users can insert work calendar holidays"
      ON public.ref_work_calendar_holidays FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ref_work_calendar_holidays'
      AND policyname = 'Authenticated users can update work calendar holidays'
  ) THEN
    CREATE POLICY "Authenticated users can update work calendar holidays"
      ON public.ref_work_calendar_holidays FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ref_work_calendar_holidays'
      AND policyname = 'Authenticated users can delete work calendar holidays'
  ) THEN
    CREATE POLICY "Authenticated users can delete work calendar holidays"
      ON public.ref_work_calendar_holidays FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_questionnaire_working_day(p_day date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(ISODOW FROM p_day) BETWEEN 1 AND 5
    AND NOT EXISTS (
      SELECT 1
      FROM public.ref_work_calendar_holidays holiday
      WHERE holiday.holiday_date = p_day
    );
$$;

CREATE OR REPLACE FUNCTION public.next_questionnaire_work_time(
  p_ts timestamptz,
  p_timezone text DEFAULT 'Asia/Qyzylorda'
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_value timestamp;
  work_start constant time := time '09:00';
  work_end constant time := time '18:00';
BEGIN
  IF p_ts IS NULL THEN
    RETURN NULL;
  END IF;

  local_value := p_ts AT TIME ZONE p_timezone;

  FOR attempt IN 1..370 LOOP
    IF NOT public.is_questionnaire_working_day(local_value::date) THEN
      local_value := (local_value::date + 1) + work_start;
      CONTINUE;
    END IF;

    IF local_value::time < work_start THEN
      local_value := local_value::date + work_start;
      RETURN local_value AT TIME ZONE p_timezone;
    END IF;

    IF local_value::time >= work_end THEN
      local_value := (local_value::date + 1) + work_start;
      CONTINUE;
    END IF;

    RETURN local_value AT TIME ZONE p_timezone;
  END LOOP;

  RETURN local_value AT TIME ZONE p_timezone;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_questionnaire_business_hours(
  p_start timestamptz,
  p_hours numeric DEFAULT 24,
  p_timezone text DEFAULT 'Asia/Qyzylorda'
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_ts timestamptz;
  current_local timestamp;
  work_start constant time := time '09:00';
  work_end constant time := time '18:00';
  work_end_local timestamp;
  available_seconds numeric;
  remaining_seconds numeric;
BEGIN
  IF p_start IS NULL THEN
    RETURN NULL;
  END IF;

  current_ts := public.next_questionnaire_work_time(p_start, p_timezone);
  remaining_seconds := GREATEST(0, COALESCE(p_hours, 0)) * 3600;

  IF remaining_seconds = 0 THEN
    RETURN current_ts;
  END IF;

  FOR attempt IN 1..370 LOOP
    current_local := current_ts AT TIME ZONE p_timezone;
    work_end_local := current_local::date + work_end;
    available_seconds := GREATEST(0, EXTRACT(EPOCH FROM (work_end_local - current_local)));

    IF remaining_seconds <= available_seconds THEN
      RETURN (current_local + (remaining_seconds * interval '1 second')) AT TIME ZONE p_timezone;
    END IF;

    remaining_seconds := remaining_seconds - available_seconds;
    current_ts := public.next_questionnaire_work_time(
      ((current_local::date + 1) + work_start) AT TIME ZONE p_timezone,
      p_timezone
    );
  END LOOP;

  RETURN current_ts;
END;
$$;

CREATE OR REPLACE FUNCTION public.questionnaire_business_seconds_between(
  p_start timestamptz,
  p_end timestamptz,
  p_timezone text DEFAULT 'Asia/Qyzylorda'
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_ts timestamptz;
  current_local timestamp;
  segment_end timestamptz;
  work_start constant time := time '09:00';
  work_end constant time := time '18:00';
  work_end_ts timestamptz;
  total_seconds integer := 0;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RETURN 0;
  END IF;

  current_ts := public.next_questionnaire_work_time(p_start, p_timezone);

  FOR attempt IN 1..370 LOOP
    EXIT WHEN current_ts >= p_end;

    current_local := current_ts AT TIME ZONE p_timezone;
    work_end_ts := (current_local::date + work_end) AT TIME ZONE p_timezone;
    segment_end := LEAST(p_end, work_end_ts);

    IF segment_end > current_ts THEN
      total_seconds := total_seconds + EXTRACT(EPOCH FROM (segment_end - current_ts))::integer;
    END IF;

    current_ts := public.next_questionnaire_work_time(
      ((current_local::date + 1) + work_start) AT TIME ZONE p_timezone,
      p_timezone
    );
  END LOOP;

  RETURN total_seconds;
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
  effective_started_at timestamptz;
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

    effective_started_at := public.next_questionnaire_work_time(now_value);

    UPDATE public.questionnaires
    SET
      workflow_status = 'in_progress',
      accepted_at = COALESCE(accepted_at, now_value),
      accepted_by = COALESCE(accepted_by, p_actor_user_id),
      processing_started_at = COALESCE(processing_started_at, now_value),
      processing_started_by = COALESCE(processing_started_by, p_actor_user_id),
      current_stage_started_at = effective_started_at,
      sla_due_at = public.add_questionnaire_business_hours(now_value, 24),
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
      total_processing_seconds = public.questionnaire_business_seconds_between(processing_started_at, now_value),
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
  effective_started_at timestamptz;
  due_at timestamptz;
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
  effective_started_at := public.next_questionnaire_work_time(started_at);
  due_at := public.add_questionnaire_business_hours(started_at, 24);

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
    current_stage_started_at = effective_started_at,
    sla_due_at = due_at,
    is_overdue = now_value > due_at,
    overdue_at = CASE
      WHEN now_value > due_at THEN COALESCE(overdue_at, due_at)
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

UPDATE public.questionnaires
SET
  current_stage_started_at = public.next_questionnaire_work_time(COALESCE(processing_started_at, current_stage_started_at, updated_at, now())),
  sla_due_at = public.add_questionnaire_business_hours(COALESCE(processing_started_at, current_stage_started_at, updated_at, now()), 24),
  is_overdue = now() > public.add_questionnaire_business_hours(COALESCE(processing_started_at, current_stage_started_at, updated_at, now()), 24),
  overdue_at = CASE
    WHEN now() > public.add_questionnaire_business_hours(COALESCE(processing_started_at, current_stage_started_at, updated_at, now()), 24)
      THEN COALESCE(overdue_at, public.add_questionnaire_business_hours(COALESCE(processing_started_at, current_stage_started_at, updated_at, now()), 24))
    ELSE NULL
  END,
  updated_at = now()
WHERE completed_at IS NULL
  AND processing_started_at IS NOT NULL
  AND workflow_status IN ('in_progress', 'overdue');

UPDATE public.questionnaires
SET
  completed_in_time = completed_at <= public.add_questionnaire_business_hours(processing_started_at, 24),
  total_processing_seconds = public.questionnaire_business_seconds_between(processing_started_at, completed_at),
  updated_at = now()
WHERE completed_at IS NOT NULL
  AND processing_started_at IS NOT NULL;
