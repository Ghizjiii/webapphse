/*
  # Add Reference Tables: Categories and Courses

  1. New Tables
    - `ref_categories` — list of employee categories synced from Bitrix24
      - `id` (uuid, primary key)
      - `name` (text, unique) — category name (e.g. ИТР, Обычный)
      - `bitrix_value` (text) — value as stored in Bitrix24 list field
      - `sort_order` (int) — display order
      - `created_at`, `updated_at`
    - `ref_courses` — list of course names synced from Bitrix24
      - `id` (uuid, primary key)
      - `name` (text, unique) — course name
      - `bitrix_value` (text) — value as stored in Bitrix24 list field
      - `sort_order` (int)
      - `created_at`, `updated_at`

  2. Security
    - Enable RLS on both tables
    - Authenticated users can read all records
    - Authenticated users can insert/update/delete records (admin operations)

  3. Seed default data
    - Default categories: ИТР, Обычный
*/

CREATE TABLE IF NOT EXISTS ref_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  bitrix_value text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  bitrix_value text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ref_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read categories"
  ON ref_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert categories"
  ON ref_categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update categories"
  ON ref_categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete categories"
  ON ref_categories FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read courses"
  ON ref_courses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert courses"
  ON ref_courses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update courses"
  ON ref_courses FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete courses"
  ON ref_courses FOR DELETE
  TO authenticated
  USING (true);

INSERT INTO ref_categories (name, bitrix_value, sort_order)
VALUES
  ('ИТР', 'ИТР', 1),
  ('Обычный', 'Обычный', 2)
ON CONFLICT (name) DO NOTHING;
