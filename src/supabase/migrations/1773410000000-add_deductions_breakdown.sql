/* 
# Add Deductions Breakdown Support
1. New Columns
  - `applied_deductions` (jsonb) in `pay_records` to store snapshots of specific deductions (category, date, amount).
2. Changes
  - Allows tracking exactly which debt items were paid in a specific pay period.
*/

ALTER TABLE pay_records ADD COLUMN IF NOT EXISTS applied_deductions jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN pay_records.applied_deductions IS 'Array of objects: [{id, category, date, amount, notes}]';