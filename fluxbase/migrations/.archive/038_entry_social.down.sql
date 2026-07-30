ALTER TABLE trip_likes DROP CONSTRAINT IF EXISTS trip_likes_entry_user_unique;
ALTER TABLE trip_likes ADD CONSTRAINT trip_likes_trip_id_user_id_key UNIQUE (trip_id, user_id);
ALTER TABLE trip_likes DROP COLUMN IF EXISTS entry_id;
