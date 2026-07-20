-- @fluxbase:name get_trip_plan
-- @fluxbase:description Returns current plan items for a specific trip, grouped by day. Use when the user asks about their itinerary or wants to modify existing items. Looks up trip by trip_id (preferred) or trip_title. Returns item_id which must be passed back for update/delete actions.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "trip_id?": "uuid", "trip_title?": "text" }
-- @fluxbase:allowed-tables my_trips, trip_plan_items
-- @fluxbase:max-execution-time 15s

-- ponytail: my_trips is RLS-scoped to the caller, so the implicit JOIN through
-- trip_id is safe — users only see plan items for trips they can read.
-- end_address for transport items lives in metadata jsonb, not a top-level column.
-- Type casts (::uuid, ::text) on every $xxx IS NULL/IS NOT NULL — without them,
-- Postgres can't infer parameter types from NULL comparisons alone (SQLSTATE 42P08).
SELECT
    tpi.id AS item_id,
    tpi.day_number,
    tpi.sort_order,
    tpi.title,
    tpi.type,
    tpi.start_time,
    tpi.end_time,
    tpi.address,
    tpi.metadata ->> 'end_address' AS end_address,
    tpi.cost_estimate,
    tpi.currency,
    tpi.booking_url,
    tpi.booking_status,
    tpi.location_lat,
    tpi.location_lng,
    tpi.notes
FROM trip_plan_items tpi
WHERE tpi.trip_id IN (
    SELECT id FROM my_trips
    WHERE ($trip_id::uuid IS NOT NULL AND id = $trip_id::uuid)
       OR ($trip_id::uuid IS NULL AND $trip_title::text IS NOT NULL AND title ILIKE '%' || $trip_title::text || '%')
)
ORDER BY tpi.day_number ASC, tpi.sort_order ASC, tpi.start_time ASC NULLS LAST;
