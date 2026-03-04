/*
  # Prevent duplicate certificates per participant/course

  1. Deduplicate existing certificates by (questionnaire_id, participant_id, course_name)
  2. Add unique index for non-null participant_id rows
*/

WITH ranked_certificates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY questionnaire_id, participant_id, COALESCE(course_name, '')
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM certificates
  WHERE questionnaire_id IS NOT NULL
    AND participant_id IS NOT NULL
)
DELETE FROM certificates c
USING ranked_certificates r
WHERE c.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_questionnaire_participant_course_unique
  ON certificates(questionnaire_id, participant_id, course_name)
  WHERE questionnaire_id IS NOT NULL AND participant_id IS NOT NULL;