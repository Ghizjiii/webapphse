/*
  # Add protocol group key

  Allows multiple protocol rows for the same questionnaire/course/category when
  a template needs one protocol per participant, for example electrical safety.
*/

ALTER TABLE protocols
  ADD COLUMN IF NOT EXISTS group_key text NOT NULL DEFAULT '';

UPDATE protocols
SET group_key = concat_ws('::', template_key, course_name, category_scope)
WHERE nullif(trim(group_key), '') IS NULL;

DROP INDEX IF EXISTS idx_protocols_unique_group;

CREATE UNIQUE INDEX IF NOT EXISTS idx_protocols_unique_group_key
  ON protocols(questionnaire_id, group_key);

CREATE INDEX IF NOT EXISTS idx_protocols_group_key
  ON protocols(group_key);

NOTIFY pgrst, 'reload schema';
