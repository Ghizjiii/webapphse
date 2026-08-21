/*
  Store files attached by clients to the public-form company comment.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'comment_attachments'
  ) THEN
    ALTER TABLE companies
      ADD COLUMN comment_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_comment_attachments_is_array'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_comment_attachments_is_array
      CHECK (jsonb_typeof(comment_attachments) = 'array');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
