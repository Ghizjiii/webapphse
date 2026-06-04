/*
  # Backfill demo workflow timings for existing questionnaires

  Fills historical stage timestamps for old submitted questionnaires so the SLA
  and analytics screens have realistic data to display in the demo environment.
  Existing non-empty values are preserved.
*/

WITH active_profiles AS (
  SELECT
    user_id,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE role
          WHEN 'admin' THEN 0
          WHEN 'coordinator' THEN 1
          WHEN 'department_head' THEN 2
          ELSE 3
        END,
        COALESCE(NULLIF(full_name, ''), email),
        user_id
    ) AS profile_index
  FROM public.app_profiles
  WHERE is_active = true
),
profile_count AS (
  SELECT COUNT(*)::integer AS total_profiles
  FROM active_profiles
),
submitted_questionnaires AS (
  SELECT
    q.id,
    q.submitted_at,
    q.created_at,
    q.created_by,
    q.workflow_status,
    q.accepted_at,
    q.processing_started_at,
    q.completed_at,
    q.accepted_by,
    q.processing_started_by,
    q.completed_by,
    q.total_processing_seconds,
    q.completed_in_time,
    q.is_overdue,
    q.overdue_at,
    q.sla_due_at,
    ROW_NUMBER() OVER (ORDER BY COALESCE(q.submitted_at, q.created_at), q.id) AS row_index
  FROM public.questionnaires q
  WHERE q.submitted_at IS NOT NULL
),
demo_values AS (
  SELECT
    q.*,
    ap.user_id AS actor_user_id,
    (q.submitted_at + ((15 + ((q.row_index * 7) % 55)) || ' minutes')::interval) AS demo_accepted_at,
    (q.submitted_at + ((55 + ((q.row_index * 11) % 180)) || ' minutes')::interval) AS demo_processing_started_at,
    (q.submitted_at + ((3 + (q.row_index % 34)) || ' hours')::interval) AS demo_completed_at,
    (q.row_index % 6) AS demo_bucket
  FROM submitted_questionnaires q
  CROSS JOIN profile_count pc
  LEFT JOIN active_profiles ap
    ON pc.total_profiles > 0
   AND ap.profile_index = ((q.row_index - 1) % pc.total_profiles) + 1
),
updated_questionnaires AS (
  UPDATE public.questionnaires q
  SET
    created_by = COALESCE(q.created_by, demo.actor_user_id),
    accepted_at = COALESCE(q.accepted_at, demo.demo_accepted_at),
    accepted_by = COALESCE(q.accepted_by, demo.actor_user_id),
    processing_started_at = COALESCE(
      q.processing_started_at,
      CASE WHEN demo.demo_bucket IN (0, 1, 2, 3, 4) THEN demo.demo_processing_started_at ELSE NULL END
    ),
    processing_started_by = COALESCE(
      q.processing_started_by,
      CASE WHEN demo.demo_bucket IN (0, 1, 2, 3, 4) THEN demo.actor_user_id ELSE NULL END
    ),
    completed_at = COALESCE(
      q.completed_at,
      CASE WHEN demo.demo_bucket IN (0, 1, 2, 3) THEN demo.demo_completed_at ELSE NULL END
    ),
    completed_by = COALESCE(
      q.completed_by,
      CASE WHEN demo.demo_bucket IN (0, 1, 2, 3) THEN demo.actor_user_id ELSE NULL END
    ),
    workflow_status = CASE
      WHEN q.completed_at IS NOT NULL OR demo.demo_bucket IN (0, 1, 2, 3) THEN 'completed'
      WHEN q.processing_started_at IS NOT NULL OR demo.demo_bucket = 4 THEN 'in_progress'
      WHEN q.accepted_at IS NOT NULL OR demo.demo_bucket = 5 THEN 'accepted'
      ELSE COALESCE(NULLIF(q.workflow_status, ''), 'submitted')
    END,
    completed_in_time = CASE
      WHEN q.completed_at IS NOT NULL OR demo.demo_bucket IN (0, 1, 2, 3) THEN
        COALESCE(q.completed_in_time, demo.demo_completed_at <= q.submitted_at + interval '24 hours')
      ELSE q.completed_in_time
    END,
    total_processing_seconds = CASE
      WHEN q.completed_at IS NOT NULL THEN
        COALESCE(q.total_processing_seconds, GREATEST(0, EXTRACT(EPOCH FROM (q.completed_at - q.submitted_at))::integer))
      WHEN demo.demo_bucket IN (0, 1, 2, 3) THEN
        COALESCE(q.total_processing_seconds, GREATEST(0, EXTRACT(EPOCH FROM (demo.demo_completed_at - q.submitted_at))::integer))
      ELSE q.total_processing_seconds
    END,
    is_overdue = CASE
      WHEN q.completed_at IS NOT NULL THEN COALESCE(q.is_overdue, false) OR q.completed_at > q.submitted_at + interval '24 hours'
      WHEN demo.demo_bucket IN (0, 1, 2, 3) THEN COALESCE(q.is_overdue, false) OR demo.demo_completed_at > q.submitted_at + interval '24 hours'
      ELSE q.is_overdue
    END,
    overdue_at = CASE
      WHEN q.completed_at IS NOT NULL AND (COALESCE(q.is_overdue, false) OR q.completed_at > q.submitted_at + interval '24 hours') THEN
        COALESCE(q.overdue_at, q.submitted_at + interval '24 hours')
      WHEN demo.demo_bucket IN (0, 1, 2, 3) AND (COALESCE(q.is_overdue, false) OR demo.demo_completed_at > q.submitted_at + interval '24 hours') THEN
        COALESCE(q.overdue_at, q.submitted_at + interval '24 hours')
      ELSE q.overdue_at
    END,
    current_stage_started_at = CASE
      WHEN q.completed_at IS NOT NULL OR demo.demo_bucket IN (0, 1, 2, 3) THEN NULL
      WHEN q.processing_started_at IS NOT NULL OR demo.demo_bucket = 4 THEN COALESCE(q.processing_started_at, demo.demo_processing_started_at)
      ELSE COALESCE(q.accepted_at, demo.demo_accepted_at)
    END,
    sla_due_at = CASE
      WHEN q.completed_at IS NOT NULL OR demo.demo_bucket IN (0, 1, 2, 3) THEN NULL
      WHEN q.processing_started_at IS NOT NULL OR demo.demo_bucket = 4 THEN COALESCE(q.processing_started_at, demo.demo_processing_started_at) + interval '24 hours'
      ELSE COALESCE(q.accepted_at, demo.demo_accepted_at) + interval '24 hours'
    END,
    updated_at = now()
  FROM demo_values demo
  WHERE q.id = demo.id
  RETURNING q.id
)
INSERT INTO public.questionnaire_events (
  questionnaire_id,
  event_type,
  from_status,
  to_status,
  occurred_at,
  actor_user_id,
  is_overdue,
  deadline_at,
  metadata
)
SELECT
  event_row.questionnaire_id,
  event_row.event_type,
  event_row.from_status,
  event_row.to_status,
  event_row.occurred_at,
  event_row.actor_user_id,
  false,
  event_row.deadline_at,
  jsonb_build_object('source', 'demo_workflow_backfill')
FROM (
  SELECT
    demo.id AS questionnaire_id,
    'submitted'::text AS event_type,
    'awaiting_submission'::text AS from_status,
    'submitted'::text AS to_status,
    demo.submitted_at AS occurred_at,
    NULL::uuid AS actor_user_id,
    demo.submitted_at + interval '24 hours' AS deadline_at
  FROM demo_values demo

  UNION ALL

  SELECT
    demo.id,
    'accepted',
    'submitted',
    'accepted',
    COALESCE(demo.accepted_at, demo.demo_accepted_at),
    demo.actor_user_id,
    COALESCE(demo.accepted_at, demo.demo_accepted_at) + interval '24 hours'
  FROM demo_values demo

  UNION ALL

  SELECT
    demo.id,
    'processing_started',
    'accepted',
    'in_progress',
    COALESCE(demo.processing_started_at, demo.demo_processing_started_at),
    demo.actor_user_id,
    COALESCE(demo.processing_started_at, demo.demo_processing_started_at) + interval '24 hours'
  FROM demo_values demo
  WHERE demo.processing_started_at IS NOT NULL OR demo.demo_bucket IN (0, 1, 2, 3, 4)

  UNION ALL

  SELECT
    demo.id,
    'completed',
    'in_progress',
    'completed',
    COALESCE(demo.completed_at, demo.demo_completed_at),
    demo.actor_user_id,
    NULL::timestamptz
  FROM demo_values demo
  WHERE demo.completed_at IS NOT NULL OR demo.demo_bucket IN (0, 1, 2, 3)
) event_row
WHERE event_row.occurred_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.questionnaire_events existing
    WHERE existing.questionnaire_id = event_row.questionnaire_id
      AND existing.event_type = event_row.event_type
  );
