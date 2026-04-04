/*
  # Add electrical safety group to reference course prices

  1. Changes
    - Adds `electrical_safety_group` to `ref_course_prices`
    - Stores Bitrix list 84 `PROPERTY_960`
*/

ALTER TABLE ref_course_prices
ADD COLUMN IF NOT EXISTS electrical_safety_group text NOT NULL DEFAULT '';
