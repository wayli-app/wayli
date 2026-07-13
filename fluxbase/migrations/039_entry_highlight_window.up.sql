-- 039: Optional map highlight window on journal entries
-- When set, narrows the map highlight to a specific time range.
-- When NULL, falls back to the full calendar day (entry_date 00:00 - 23:59).
ALTER TABLE trip_entries ADD COLUMN IF NOT EXISTS highlight_start timestamptz;
ALTER TABLE trip_entries ADD COLUMN IF NOT EXISTS highlight_end timestamptz;

COMMENT ON COLUMN trip_entries.highlight_start IS 'Optional start of the map highlight window. NULL = use entry_date 00:00.';
COMMENT ON COLUMN trip_entries.highlight_end IS 'Optional end of the map highlight window. NULL = use entry_date 23:59.';
