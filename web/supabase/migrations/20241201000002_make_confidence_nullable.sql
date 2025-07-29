-- Make confidence column nullable in suggested_trips table
-- Since we removed the confidence logic, this column should be optional

ALTER TABLE public.suggested_trips
ALTER COLUMN confidence DROP NOT NULL;

-- Add a comment to explain the change
COMMENT ON COLUMN public.suggested_trips.confidence IS 'Trip confidence score (0-1). Made nullable since confidence logic was removed.';