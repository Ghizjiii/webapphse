/*
  # Add metadata columns for generated documents

  1. Schema
    - Add `course_name`, `category`, `employees_count` to `generated_documents`
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'generated_documents'
      AND column_name = 'course_name'
  ) THEN
    ALTER TABLE generated_documents ADD COLUMN course_name text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'generated_documents'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE generated_documents ADD COLUMN category text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'generated_documents'
      AND column_name = 'employees_count'
  ) THEN
    ALTER TABLE generated_documents ADD COLUMN employees_count integer DEFAULT 0;
  END IF;
END $$;
