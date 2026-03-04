/*
  # Prevent duplicate companies/deals per questionnaire

  1. Deduplicate existing rows in companies by questionnaire_id (keep newest)
  2. Deduplicate existing rows in deals by questionnaire_id (keep row with bitrix_deal_id first, then newest)
  3. Add unique indexes to prevent future duplicates
*/

-- Companies: keep newest row per questionnaire_id
WITH ranked_companies AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY questionnaire_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM companies
  WHERE questionnaire_id IS NOT NULL
)
DELETE FROM companies c
USING ranked_companies r
WHERE c.id = r.id
  AND r.rn > 1;

-- Deals: keep row with non-empty bitrix_deal_id first, then newest
WITH ranked_deals AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY questionnaire_id
      ORDER BY
        CASE WHEN COALESCE(bitrix_deal_id, '') <> '' THEN 0 ELSE 1 END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM deals
  WHERE questionnaire_id IS NOT NULL
)
DELETE FROM deals d
USING ranked_deals r
WHERE d.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_questionnaire_unique
  ON companies(questionnaire_id)
  WHERE questionnaire_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_questionnaire_unique
  ON deals(questionnaire_id)
  WHERE questionnaire_id IS NOT NULL;