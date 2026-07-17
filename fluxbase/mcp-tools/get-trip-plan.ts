// @fluxbase:name get_trip_plan
// @fluxbase:namespace wayli
// @fluxbase:description Returns the current plan items for a specific trip, grouped by day. Use when the user asks about their current itinerary or wants to modify existing plan items.
// @fluxbase:timeout 15
// @fluxbase:memory 128

interface GetTripPlanArgs {
  trip_id?: string;
  tripTitle?: string;
}

export default async function handler(
  args: GetTripPlanArgs,
  fluxbase: any,
  _fluxbaseService: any,
  _utils: any
) {
  const { trip_id, tripTitle } = args;

  let tripId = trip_id;

  // If only tripTitle given, look up the trip
  if (!tripId && tripTitle) {
    const { data } = await fluxbase.rpc('execute_sql', {
      query: `SELECT id FROM my_trips WHERE title ILIKE '%${tripTitle.replace(/'/g, "''")}%' LIMIT 1`
    });
    if (data && data[0]) tripId = data[0].id;
  }

  if (!tripId) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'No trip_id provided' }) }]
    };
  }

  const escapedId = tripId.replace(/'/g, "''");
  const { data, error } = await fluxbase.rpc('execute_sql', {
    query: `
			SELECT day_number, sort_order, title, type, start_time, end_time,
			       address, cost_estimate, currency, booking_url, booking_status,
			       location_lat, location_lng, notes
			FROM trip_plan_items
			WHERE trip_id = '${escapedId}'
			ORDER BY day_number ASC, sort_order ASC, start_time ASC NULLS LAST
		`
  });

  if (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }] };
  }

  // Group by day
  const byDay: Record<number, any[]> = {};
  for (const item of data || []) {
    const day = item.day_number || 1;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(item);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            trip_id: tripId,
            days: Object.keys(byDay).length,
            total_items: (data || []).length,
            plan: byDay
          },
          null,
          2
        )
      }
    ]
  };
}
