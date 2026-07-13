import { fluxbase } from '$lib/fluxbase';

type GpsRow = { lat: number; lng: number; date: string };

/**
 * Paginated tracker_data fetcher.
 * Fluxbase API caps at 1000 rows per request — this loops until all pages are loaded.
 */
export async function fetchTrackPoints(
	userId: string,
	startDate: string,
	endDate: string,
	maxPoints = 500
): Promise<GpsRow[]> {
	const sd = (startDate || '').slice(0, 10);
	const ed = (endDate || '').slice(0, 10);

	let offset = 0;
	let allRows: any[] = [];

	while (true) {
		const { data } = await fluxbase
			.from<Record<string, any>>('tracker_data')
			.select('location, recorded_at')
			.eq('user_id', userId)
			.gte('recorded_at', `${sd}T00:00:00Z`)
			.lte('recorded_at', `${ed}T23:59:59Z`)
			.order('recorded_at', { ascending: true })
			.range(offset, offset + 999);

		const batch = (data as any[]) ?? [];
		allRows.push(...batch);
		if (batch.length < 1000) break;
		offset += 1000;
	}

	if (allRows.length === 0) return [];

	const stride = Math.max(1, Math.ceil(allRows.length / maxPoints));
	return allRows
		.filter((_, i) => i % stride === 0)
		.map((p) => {
			const loc = p.location;
			return {
				lat: loc?.coordinates?.[1],
				lng: loc?.coordinates?.[0],
				date: p.recorded_at ? new Date(p.recorded_at).toISOString().slice(0, 10) : ''
			};
		})
		.filter((p) => p.lat != null && p.lng != null);
}
