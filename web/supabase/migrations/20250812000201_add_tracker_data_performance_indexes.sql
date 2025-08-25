-- Add performance indexes for distance calculation queries
-- This migration adds composite indexes to improve the performance of the update_tracker_distances_batch function

-- Composite index for user_id + recorded_at + location (for the main distance calculation query)
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_timestamp_location
ON public.tracker_data(user_id, recorded_at)
WHERE location IS NOT NULL;

-- Composite index for user_id + recorded_at + distance (for finding records without distance)
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_timestamp_distance
ON public.tracker_data(user_id, recorded_at)
WHERE distance IS NULL OR distance = 0;

-- Index for the LAG window function optimization
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_timestamp_ordered
ON public.tracker_data(user_id, recorded_at, location)
WHERE location IS NOT NULL;

-- Add comment explaining the purpose of these indexes
COMMENT ON INDEX idx_tracker_data_user_timestamp_location IS 'Optimizes distance calculation queries by user and timestamp with location filter';
COMMENT ON INDEX idx_tracker_data_user_timestamp_distance IS 'Optimizes finding records that need distance calculation';
COMMENT ON INDEX idx_tracker_data_user_timestamp_ordered IS 'Optimizes LAG window function performance for distance calculations';
