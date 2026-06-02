/*
  # Backfill demo regions for existing questionnaires

  Existing data in the demo environment is mock data, so blank departments/regions
  are distributed across the five Bitrix list items for presentation purposes.
*/

WITH demo_regions(sort_order, region_bitrix_item_id, region_name) AS (
  VALUES
    (0, '1392', 'Астана 1'),
    (1, '1394', 'Астана 2'),
    (2, '1396', 'Астана 3'),
    (3, '1398', 'Алматы'),
    (4, '1400', 'Шымкент')
),
blank_questionnaires AS (
  SELECT
    id,
    ((ROW_NUMBER() OVER (ORDER BY created_at NULLS FIRST, id) - 1) % 5)::integer AS region_index
  FROM public.questionnaires
  WHERE COALESCE(BTRIM(region_name), '') = ''
)
UPDATE public.questionnaires AS questionnaires
SET
  region_bitrix_item_id = demo_regions.region_bitrix_item_id,
  region_name = demo_regions.region_name,
  updated_at = now()
FROM blank_questionnaires
JOIN demo_regions ON demo_regions.sort_order = blank_questionnaires.region_index
WHERE questionnaires.id = blank_questionnaires.id;
