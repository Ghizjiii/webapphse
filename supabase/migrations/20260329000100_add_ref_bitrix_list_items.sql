/*
  # Add ref_bitrix_list_items mirror table

  1. Purpose
    - Keep a local Supabase mirror of Bitrix /company/lists/ items
    - Let the app read reference values from Supabase after one sync action

  2. Security
    - Authenticated users can fully manage mirrored records
    - Anon users can read mirrored records when needed by public forms
*/

CREATE TABLE IF NOT EXISTS ref_bitrix_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_key text NOT NULL,
  list_name text NOT NULL,
  iblock_id integer NOT NULL,
  bitrix_item_id text NOT NULL,
  name text NOT NULL,
  bitrix_value text DEFAULT '',
  code text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ref_bitrix_list_items_iblock_item_uidx
  ON ref_bitrix_list_items (iblock_id, bitrix_item_id);

CREATE INDEX IF NOT EXISTS ref_bitrix_list_items_list_key_sort_idx
  ON ref_bitrix_list_items (list_key, sort_order, name);

ALTER TABLE ref_bitrix_list_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ref_bitrix_list_items' AND policyname = 'Authenticated users can read bitrix list items'
  ) THEN
    CREATE POLICY "Authenticated users can read bitrix list items"
      ON ref_bitrix_list_items FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ref_bitrix_list_items' AND policyname = 'Authenticated users can insert bitrix list items'
  ) THEN
    CREATE POLICY "Authenticated users can insert bitrix list items"
      ON ref_bitrix_list_items FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ref_bitrix_list_items' AND policyname = 'Authenticated users can update bitrix list items'
  ) THEN
    CREATE POLICY "Authenticated users can update bitrix list items"
      ON ref_bitrix_list_items FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ref_bitrix_list_items' AND policyname = 'Authenticated users can delete bitrix list items'
  ) THEN
    CREATE POLICY "Authenticated users can delete bitrix list items"
      ON ref_bitrix_list_items FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ref_bitrix_list_items' AND policyname = 'Public can read bitrix list items'
  ) THEN
    CREATE POLICY "Public can read bitrix list items"
      ON ref_bitrix_list_items FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;
