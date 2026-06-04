/*
  # Add questionnaire workflow SLA tracking

  Tracks coordinator processing stages independently from the public form link
  status, and stores an immutable event history for analytics.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'questionnaires'
      AND column_name = 'workflow_status'
  ) THEN
    ALTER TABLE public.questionnaires
      ADD COLUMN workflow_status text NOT NULL DEFAULT 'awaiting_submission';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'accepted_at'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN accepted_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'accepted_by'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'processing_started_at'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN processing_started_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'processing_started_by'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN processing_started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN completed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'completed_by'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'current_stage_started_at'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN current_stage_started_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'sla_due_at'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN sla_due_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'is_overdue'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN is_overdue boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'overdue_at'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN overdue_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'completed_in_time'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN completed_in_time boolean;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questionnaires' AND column_name = 'total_processing_seconds'
  ) THEN
    ALTER TABLE public.questionnaires ADD COLUMN total_processing_seconds integer;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.questionnaire_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES public.questionnaires(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_overdue boolean NOT NULL DEFAULT false,
  deadline_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.questionnaire_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'questionnaire_events'
      AND policyname = 'Authenticated users can read questionnaire events'
  ) THEN
    CREATE POLICY "Authenticated users can read questionnaire events"
      ON public.questionnaire_events
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_questionnaire_events_questionnaire_id_occurred_at
  ON public.questionnaire_events(questionnaire_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_questionnaire_events_event_type
  ON public.questionnaire_events(event_type);

CREATE INDEX IF NOT EXISTS idx_questionnaires_workflow_status
  ON public.questionnaires(workflow_status);

CREATE INDEX IF NOT EXISTS idx_questionnaires_completed_at
  ON public.questionnaires(completed_at);

CREATE INDEX IF NOT EXISTS idx_questionnaires_sla_due_at
  ON public.questionnaires(sla_due_at)
  WHERE completed_at IS NULL;

ALTER TABLE public.questionnaires
  DROP CONSTRAINT IF EXISTS questionnaires_workflow_status_check;

ALTER TABLE public.questionnaires
  ADD CONSTRAINT questionnaires_workflow_status_check
  CHECK (workflow_status IN (
    'awaiting_submission',
    'submitted',
    'accepted',
    'in_progress',
    'completed',
    'overdue',
    'archived'
  ));

CREATE OR REPLACE FUNCTION public.log_questionnaire_event(
  p_questionnaire_id uuid,
  p_event_type text,
  p_from_status text DEFAULT NULL,
  p_to_status text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT auth.uid(),
  p_is_overdue boolean DEFAULT false,
  p_deadline_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_id uuid;
BEGIN
  INSERT INTO public.questionnaire_events (
    questionnaire_id,
    event_type,
    from_status,
    to_status,
    actor_user_id,
    is_overdue,
    deadline_at,
    metadata
  )
  VALUES (
    p_questionnaire_id,
    p_event_type,
    p_from_status,
    p_to_status,
    p_actor_user_id,
    COALESCE(p_is_overdue, false),
    p_deadline_at,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_questionnaire_submission_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_exists boolean;
BEGIN
  IF NEW.submitted_at IS NOT NULL
    AND OLD.submitted_at IS NULL
    AND NEW.workflow_status = 'awaiting_submission'
  THEN
    NEW.workflow_status := 'submitted';
    NEW.current_stage_started_at := NEW.submitted_at;
    NEW.sla_due_at := NEW.submitted_at + interval '24 hours';
  END IF;

  IF NEW.workflow_status = 'completed' THEN
    NEW.sla_due_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questionnaires_sync_submission_workflow ON public.questionnaires;

CREATE TRIGGER questionnaires_sync_submission_workflow
BEFORE UPDATE ON public.questionnaires
FOR EACH ROW
EXECUTE FUNCTION public.sync_questionnaire_submission_workflow();

CREATE OR REPLACE FUNCTION public.log_questionnaire_submission_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_exists boolean;
BEGIN
  IF NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.questionnaire_events
      WHERE questionnaire_id = NEW.id
        AND event_type = 'submitted'
    ) INTO event_exists;

    IF NOT event_exists THEN
      PERFORM public.log_questionnaire_event(
        NEW.id,
        'submitted',
        OLD.workflow_status,
        NEW.workflow_status,
        NULL,
        false,
        NEW.sla_due_at,
        jsonb_build_object('submitted_at', NEW.submitted_at)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questionnaires_log_submission_event ON public.questionnaires;

CREATE TRIGGER questionnaires_log_submission_event
AFTER UPDATE ON public.questionnaires
FOR EACH ROW
EXECUTE FUNCTION public.log_questionnaire_submission_event();

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

  was_overdue := COALESCE(current_row.is_overdue, false)
    OR (
      current_row.sla_due_at IS NOT NULL
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
      sla_due_at = now_value + interval '24 hours',
      is_overdue = was_overdue,
      overdue_at = CASE WHEN was_overdue THEN COALESCE(overdue_at, now_value) ELSE overdue_at END,
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
    WHERE workflow_status IN ('submitted', 'accepted', 'in_progress')
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

UPDATE public.questionnaires q
SET
  workflow_status = CASE
    WHEN d.sync_status = 'success' THEN 'completed'
    WHEN q.submitted_at IS NOT NULL THEN 'submitted'
    ELSE 'awaiting_submission'
  END,
  current_stage_started_at = CASE
    WHEN d.sync_status = 'success' THEN NULL
    WHEN q.submitted_at IS NOT NULL THEN q.submitted_at
    ELSE q.created_at
  END,
  sla_due_at = CASE
    WHEN d.sync_status = 'success' THEN NULL
    WHEN q.submitted_at IS NOT NULL THEN q.submitted_at + interval '24 hours'
    ELSE NULL
  END,
  completed_at = CASE WHEN d.sync_status = 'success' THEN COALESCE(d.synced_at, d.updated_at) ELSE q.completed_at END,
  completed_by = CASE WHEN d.sync_status = 'success' THEN COALESCE(q.completed_by, q.created_by) ELSE q.completed_by END,
  completed_in_time = CASE
    WHEN d.sync_status = 'success' AND q.submitted_at IS NOT NULL THEN COALESCE(d.synced_at, d.updated_at) <= q.submitted_at + interval '24 hours'
    ELSE q.completed_in_time
  END,
  total_processing_seconds = CASE
    WHEN d.sync_status = 'success' AND q.submitted_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(d.synced_at, d.updated_at) - q.submitted_at))::integer)
    ELSE q.total_processing_seconds
  END
FROM public.deals d
WHERE d.questionnaire_id = q.id
  AND (d.sync_status = 'success' OR q.submitted_at IS NOT NULL);

UPDATE public.questionnaires
SET
  workflow_status = CASE WHEN submitted_at IS NOT NULL THEN 'submitted' ELSE 'awaiting_submission' END,
  current_stage_started_at = CASE WHEN submitted_at IS NOT NULL THEN submitted_at ELSE created_at END,
  sla_due_at = CASE WHEN submitted_at IS NOT NULL THEN submitted_at + interval '24 hours' ELSE NULL END
WHERE completed_at IS NULL
  AND workflow_status = 'awaiting_submission'
  AND submitted_at IS NOT NULL;
