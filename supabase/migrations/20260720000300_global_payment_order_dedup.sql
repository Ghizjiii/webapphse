WITH ranked_registry AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY payment_order_number_norm, payment_order_date, payment_order_amount
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.payment_order_registry
  WHERE
    payment_order_number_norm <> ''
    AND payment_order_date IS NOT NULL
    AND payment_order_amount IS NOT NULL
)
DELETE FROM public.payment_order_registry registry
USING ranked_registry ranked
WHERE registry.id = ranked.id
  AND ranked.rn > 1;

DROP INDEX IF EXISTS public.uq_payment_order_registry_business_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_order_registry_business_key
  ON public.payment_order_registry (
    payment_order_number_norm,
    payment_order_date,
    payment_order_amount
  );

NOTIFY pgrst, 'reload schema';
