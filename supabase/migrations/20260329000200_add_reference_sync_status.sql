/*
  # Add reference sync status table

  1. Purpose
    - Track background and manual synchronization state for reference data
    - Store last successful sync timestamp for the Reference page UI

  2. Security
    - Authenticated users can read status
    - Authenticated users can upsert/update status from the app when needed
*/

CREATE TABLE IF NOT EXISTS reference_sync_status (
  scope text PRIMARY KEY,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  last_source text NOT NULL DEFAULT '',
  last_event text NOT NULL DEFAULT '',
  last_status text NOT NULL DEFAULT 'idle'
    CHECK (last_status IN ('idle', 'running', 'success', 'error')),
  last_error text NOT NULL DEFAULT '',
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reference_sync_status ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reference_sync_status'
      AND policyname = 'Authenticated users can read reference sync status'
  ) THEN
    CREATE POLICY "Authenticated users can read reference sync status"
      ON reference_sync_status FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reference_sync_status'
      AND policyname = 'Authenticated users can insert reference sync status'
  ) THEN
    CREATE POLICY "Authenticated users can insert reference sync status"
      ON reference_sync_status FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reference_sync_status'
      AND policyname = 'Authenticated users can update reference sync status'
  ) THEN
    CREATE POLICY "Authenticated users can update reference sync status"
      ON reference_sync_status FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
