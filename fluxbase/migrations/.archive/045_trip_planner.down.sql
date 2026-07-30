DROP TABLE IF EXISTS trip_plan_items;
DROP TABLE IF EXISTS trip_collaborators;
ALTER TABLE trips DROP COLUMN IF EXISTS budget_total;
ALTER TABLE trips DROP COLUMN IF EXISTS budget_currency;
