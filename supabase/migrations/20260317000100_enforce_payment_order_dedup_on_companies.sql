/*
  Enforce payment order deduplication at companies level.
  Business key: BIN/IIN digits + normalized payment number + payment date + amount.
*/

-- 1) Normalize legacy duplicates so unique index can be created safely.
WITH normalized AS (
  SELECT
    id,
    updated_at,
    created_at,
    regexp_replace(coalesce(bin_iin, ''), '\D+', '', 'g') AS bin_digits,
    CASE
      WHEN regexp_replace(lower(coalesce(payment_order_number, '')), '[^a-zа-я0-9]+', '', 'g') ~ '^[0-9]+$'
        THEN COALESCE(NULLIF(ltrim(regexp_replace(lower(coalesce(payment_order_number, '')), '[^a-zа-я0-9]+', '', 'g'), '0'), ''), '0')
      ELSE regexp_replace(lower(coalesce(payment_order_number, '')), '[^a-zа-я0-9]+', '', 'g')
    END AS number_norm,
    payment_order_date,
    payment_order_amount
  FROM companies
),
ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY bin_digits, number_norm, payment_order_date, payment_order_amount
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM normalized
  WHERE
    bin_digits <> ''
    AND number_norm <> ''
    AND payment_order_date IS NOT NULL
    AND payment_order_amount IS NOT NULL
)
UPDATE companies c
SET
  payment_order_number = '',
  payment_order_date = NULL,
  payment_order_amount = NULL,
  payment_order_url = '',
  payment_order_name = '',
  payment_order_uploaded_at = NULL,
  payment_order_storage_bucket = '',
  payment_order_storage_path = '',
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- 2) Create unique business-key index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_payment_order_business_key
ON companies (
  regexp_replace(coalesce(bin_iin, ''), '\D+', '', 'g'),
  (
    CASE
      WHEN regexp_replace(lower(coalesce(payment_order_number, '')), '[^a-zа-я0-9]+', '', 'g') ~ '^[0-9]+$'
        THEN COALESCE(NULLIF(ltrim(regexp_replace(lower(coalesce(payment_order_number, '')), '[^a-zа-я0-9]+', '', 'g'), '0'), ''), '0')
      ELSE regexp_replace(lower(coalesce(payment_order_number, '')), '[^a-zа-я0-9]+', '', 'g')
    END
  ),
  payment_order_date,
  payment_order_amount
)
WHERE
  regexp_replace(coalesce(bin_iin, ''), '\D+', '', 'g') <> ''
  AND coalesce(payment_order_number, '') <> ''
  AND payment_order_date IS NOT NULL
  AND payment_order_amount IS NOT NULL;

