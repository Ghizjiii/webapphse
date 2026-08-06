/*
  # Add previous electrical safety group

  1. Changes
    - Store the participant's existing electrical safety group per selected course
    - Copy the value into generated certificate rows for document placeholders
*/

ALTER TABLE participant_courses
ADD COLUMN IF NOT EXISTS previous_electrical_safety_group text NOT NULL DEFAULT '';

ALTER TABLE certificates
ADD COLUMN IF NOT EXISTS previous_electrical_safety_group text NOT NULL DEFAULT '';

