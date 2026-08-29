-- @fluxbase:description Return the raw GPS track (lat/lng, time-ordered) for a trip. Gated by can_see_gps(): the owner always sees their track; other viewers see it when gps_visible_to permits them (public trip, explicit share, or accepted friend connection). Public trips (visibility='public') always serve their track to any viewer — points inside the owner's privacy zones (home address + trip exclusions) are clipped out inside the function. Bypasses tracker_data RLS via the SECURITY DEFINER function — tracker_data has no anon/public SELECT policy, so this is the only path for public/shared trip tracks.
-- @fluxbase:require-role anon, authenticated
-- @fluxbase:input { "trip_uuid": "uuid" }
-- @fluxbase:allowed-tables trips, tracker_data
-- @fluxbase:max-execution-time 15s

SELECT lat, lng, recorded_at FROM get_public_trip_track($trip_uuid::uuid);
