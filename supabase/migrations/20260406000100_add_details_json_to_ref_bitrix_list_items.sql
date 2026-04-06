/*
  # Add details_json to ref_bitrix_list_items

  1. Changes
    - Adds nullable `details_json` jsonb column
    - Stores parsed Bitrix List extra properties for complex reference tabs
*/

ALTER TABLE ref_bitrix_list_items
ADD COLUMN IF NOT EXISTS details_json jsonb NULL;
