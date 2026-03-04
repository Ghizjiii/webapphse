/*
  # Fix participant_courses table structure
  
  ## Changes
  - Drop old composite primary key (participant_id, course_id)
  - Add id column as new primary key
  - Make course_id nullable (courses now stored as free text)
  - Add unique constraint on (participant_id, course_name) to prevent duplicates
  
  ## Reason
  Courses are now fetched from Bitrix24 and stored as text (course_name), 
  not as UUID references to a local courses table.
*/

ALTER TABLE participant_courses DROP CONSTRAINT IF EXISTS participant_courses_pkey;
ALTER TABLE participant_courses DROP CONSTRAINT IF EXISTS participant_courses_course_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participant_courses' AND column_name = 'id'
  ) THEN
    ALTER TABLE participant_courses ADD COLUMN id uuid DEFAULT gen_random_uuid();
  END IF;
END $$;

ALTER TABLE participant_courses ADD PRIMARY KEY (id);

DO $$
BEGIN
  ALTER TABLE participant_courses ALTER COLUMN course_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_participant_courses_unique ON participant_courses(participant_id, course_name);
