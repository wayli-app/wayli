-- @fluxbase:description Return the GPS track (lat/lng, speed, time-ordered) for a fitness activity, with points inside the owner's privacy zones (home address + trip exclusions) clipped out. Gated by can_see_activity(): the owner always sees their track; other viewers see it only when the activity's effective sharing audience (per-activity override or the user's global fitness default) permits them. Heart-rate/power/cadence records are never served here. SECURITY DEFINER — tracker_data has no anon/public SELECT policy, so this is the only path for shared activity tracks.
-- @fluxbase:require-role anon, authenticated
-- @fluxbase:input { "activity_uuid": "uuid" }
-- @fluxbase:allowed-tables fitness_activities, tracker_data
-- @fluxbase:max-execution-time 15s

SELECT lat, lng, recorded_at, speed FROM get_public_activity_track($activity_uuid::uuid);
