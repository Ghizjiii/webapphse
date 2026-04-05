/*
  # Allow multiple certificate variants per base course

  1. Replaces old uniqueness by `(questionnaire_id, participant_id, course_name)`
  2. New uniqueness includes qualification and electrical safety group
  3. Keeps exact duplicate cleanup for the new tuple
*/

DROP INDEX IF EXISTS idx_certificates_questionnaire_participant_course_unique;

WITH ranked_certificates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        questionnaire_id,
        participant_id,
        COALESCE(course_name, ''),
        COALESCE(qualification, ''),
        COALESCE(electrical_safety_group, '')
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_questionnaire_participant_course_variant_unique
  ON certificates(
    questionnaire_id,
    participant_id,
    COALESCE(course_name, ''),
    COALESCE(qualification, ''),
    COALESCE(electrical_safety_group, '')
  )
  WHERE questionnaire_id IS NOT NULL AND participant_id IS NOT NULL;
