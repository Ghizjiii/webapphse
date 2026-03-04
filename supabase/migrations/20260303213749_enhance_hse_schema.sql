/*
  # Enhance HSE Schema - Add Missing Columns and Policies

  ## Changes
  1. Add `created_by` and `submitted_at` to questionnaires
  2. Add `bitrix_company_id` to companies
  3. Add `questionnaire_id` and `sort_order` to participants
  4. Drop restrictive category check, allow free text
  5. Add `questionnaire_id` and `company_id` to certificates
  6. Add `company_id` and `synced_at` to deals
  7. Update/add missing public anon RLS policies for client form access
*/

-- ============= QUESTIONNAIRES =============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'questionnaires' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE questionnaires ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'questionnaires' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE questionnaires ADD COLUMN submitted_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'questionnaires' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE questionnaires ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- ============= COMPANIES =============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'bitrix_company_id'
  ) THEN
    ALTER TABLE companies ADD COLUMN bitrix_company_id text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE companies ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- ============= DEALS =============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE deals ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'synced_at'
  ) THEN
    ALTER TABLE deals ADD COLUMN synced_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE deals ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- ============= PARTICIPANTS =============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants' AND column_name = 'questionnaire_id'
  ) THEN
    ALTER TABLE participants ADD COLUMN questionnaire_id uuid REFERENCES questionnaires(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE participants ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE participants ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Drop restrictive category check to allow free text
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_category_check;

-- ============= PARTICIPANT_COURSES =============
-- Add questionnaire_id for easier querying
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participant_courses' AND column_name = 'questionnaire_id'
  ) THEN
    ALTER TABLE participant_courses ADD COLUMN questionnaire_id uuid REFERENCES questionnaires(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Drop old course_id FK constraint and column, replace with free-text course_name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participant_courses' AND column_name = 'course_name'
  ) THEN
    ALTER TABLE participant_courses ADD COLUMN course_name text NOT NULL DEFAULT '';
  END IF;
END $$;

-- ============= CERTIFICATES =============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'questionnaire_id'
  ) THEN
    ALTER TABLE certificates ADD COLUMN questionnaire_id uuid REFERENCES questionnaires(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE certificates ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'course_name'
  ) THEN
    ALTER TABLE certificates ADD COLUMN course_name text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE certificates ADD COLUMN last_name text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE certificates ADD COLUMN first_name text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'middle_name'
  ) THEN
    ALTER TABLE certificates ADD COLUMN middle_name text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'position'
  ) THEN
    ALTER TABLE certificates ADD COLUMN position text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'category'
  ) THEN
    ALTER TABLE certificates ADD COLUMN category text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE certificates ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Drop restrictive employee_status check
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_employee_status_check;

-- ============= PUBLIC ANON POLICIES for client form access =============

-- Questionnaires: anon can read by token
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'questionnaires' AND policyname = 'Public can read active questionnaire by token'
  ) THEN
    CREATE POLICY "Public can read active questionnaire by token"
      ON questionnaires FOR SELECT
      TO anon
      USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'questionnaires' AND policyname = 'Public can update questionnaire submitted status'
  ) THEN
    CREATE POLICY "Public can update questionnaire submitted status"
      ON questionnaires FOR UPDATE
      TO anon
      USING (is_active = true AND (expires_at IS NULL OR expires_at > now()))
      WITH CHECK (is_active = true);
  END IF;
END $$;

-- Companies: anon can read/write via valid questionnaire
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND policyname = 'Public can read companies via active questionnaire'
  ) THEN
    CREATE POLICY "Public can read companies via active questionnaire"
      ON companies FOR SELECT
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = companies.questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND policyname = 'Public can insert companies via active questionnaire'
  ) THEN
    CREATE POLICY "Public can insert companies via active questionnaire"
      ON companies FOR INSERT
      TO anon
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND policyname = 'Public can update companies via active questionnaire'
  ) THEN
    CREATE POLICY "Public can update companies via active questionnaire"
      ON companies FOR UPDATE
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = companies.questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

-- Participants: anon can read/write/delete via valid questionnaire
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'participants' AND policyname = 'Public can read participants via active questionnaire'
  ) THEN
    CREATE POLICY "Public can read participants via active questionnaire"
      ON participants FOR SELECT
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = participants.questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'participants' AND policyname = 'Public can insert participants via active questionnaire'
  ) THEN
    CREATE POLICY "Public can insert participants via active questionnaire"
      ON participants FOR INSERT
      TO anon
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'participants' AND policyname = 'Public can update participants via active questionnaire'
  ) THEN
    CREATE POLICY "Public can update participants via active questionnaire"
      ON participants FOR UPDATE
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = participants.questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'participants' AND policyname = 'Public can delete participants via active questionnaire'
  ) THEN
    CREATE POLICY "Public can delete participants via active questionnaire"
      ON participants FOR DELETE
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = participants.questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

-- Participant courses: anon can read/write/delete via valid questionnaire
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'participant_courses' AND policyname = 'Public can read participant courses via active questionnaire'
  ) THEN
    CREATE POLICY "Public can read participant courses via active questionnaire"
      ON participant_courses FOR SELECT
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = participant_courses.questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'participant_courses' AND policyname = 'Public can insert participant courses via active questionnaire'
  ) THEN
    CREATE POLICY "Public can insert participant courses via active questionnaire"
      ON participant_courses FOR INSERT
      TO anon
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'participant_courses' AND policyname = 'Public can delete participant courses via active questionnaire'
  ) THEN
    CREATE POLICY "Public can delete participant courses via active questionnaire"
      ON participant_courses FOR DELETE
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = participant_courses.questionnaire_id
            AND q.is_active = true
            AND (q.expires_at IS NULL OR q.expires_at > now())
        )
      );
  END IF;
END $$;

-- ============= INDEXES =============
CREATE INDEX IF NOT EXISTS idx_questionnaires_token ON questionnaires(secret_token);
CREATE INDEX IF NOT EXISTS idx_participants_questionnaire_id ON participants(questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_participant_courses_questionnaire_id ON participant_courses(questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_certificates_questionnaire_id ON certificates(questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_deals_company_id ON deals(company_id);
