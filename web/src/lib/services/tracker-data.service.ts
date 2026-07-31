import { fluxbase } from '$lib/fluxbase';

/**
 * Normalize any date-like value to a yyyy-MM-dd string. The DateRangePicker and
 * @svelte-plugins/datepicker emit a variety of shapes (string, Date, SvelteDate,
 * or the picker's own date wrapper); route them all through `new Date()`, which
 * accepts Date/string/number/object-with-time-value. Returns '' for empty/invalid
 * input so callers produce an unbounded query rather than crashing.
 */
function toDateStr(d: unknown): string {
	if (d === null || d === undefined || d === '') return '';
	// Plain yyyy-MM-dd string (the most common case) — return as-is, truncated.
	if (typeof d === 'string') return d.slice(0, 10);
	// Date / SvelteDate / picker wrapper / number epoch → via new Date().
	const date = new Date(d as any);
	if (isNaN(date.getTime())) return '';
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

export type DataPoint = {
	recorded_at: string;
	lat: number;
	lng: number;
	speed: number | null;
	distance: number | null;
	accuracy: number | null;
	country_code: string | null;
	activity_type: string | null;
};

export type ExclusionZone = {
	name: string;
	location: { lat: number; lng: number };
	radius: number;
};

/**
 * Fetch tracker_data points for a date range (paginated, max 1000 per batch).
 */
export async function getPoints(
	userId: string,
	startDate: string | Date,
	endDate: string | Date,
	onProgress?: (loaded: number, total: number) => void
): Promise<DataPoint[]> {
	const sd = toDateStr(startDate);
	const ed = toDateStr(endDate);

	const allPoints: any[] = [];
	let offset = 0;

	while (true) {
		const { data, error } = await fluxbase
			.from<Record<string, any>>('tracker_data')
			.select('recorded_at, location, speed, distance, accuracy, country_code, activity_type')
			.eq('user_id', userId)
			.gte('recorded_at', `${sd}T00:00:00Z`)
			.lte('recorded_at', `${ed}T23:59:59Z`)
			.order('recorded_at', { ascending: true })
			.range(offset, offset + 999);

		if (error) throw new Error(error.message);

		const batch = (data as any[]) ?? [];
		allPoints.push(...batch);
		// Report progress. The total isn't known until the final (short) batch,
		// so we pass allPoints.length and the batch fill-ratio; callers that
		// have an exact count (e.g. Data Editor) supply it via the total arg
		// pattern by closing over getPointCount.
		if (onProgress) {
			// Heuristic total: if the batch is full, assume at least this many
			// more remain proportionally; caller can override via its own count.
			onProgress(
				allPoints.length,
				batch.length < 1000 ? allPoints.length : allPoints.length + 1000
			);
		}
		if (batch.length < 1000) break;
		offset += 1000;
	}

	// Cap at 5000 points for map performance
	let points = allPoints;
	if (allPoints.length > 5000) {
		const stride = Math.ceil(allPoints.length / 5000);
		points = allPoints.filter((_, i) => i % stride === 0);
	}

	return points.map((p) => {
		const loc = p.location;
		return {
			recorded_at: p.recorded_at,
			lat: loc?.coordinates?.[1] ?? loc?.lat ?? 0,
			lng: loc?.coordinates?.[0] ?? loc?.lng ?? 0,
			speed: p.speed ?? null,
			distance: p.distance ?? null,
			accuracy: p.accuracy ?? null,
			country_code: p.country_code ?? null,
			activity_type: p.activity_type ?? null
		};
	});
}

/**
 * Get total count of points in a date range (for display).
 */
export async function getPointCount(
	userId: string,
	startDate: string | Date,
	endDate: string | Date
): Promise<number> {
	const sd = toDateStr(startDate);
	const ed = toDateStr(endDate);

	const { count, error } = await fluxbase
		.from('tracker_data')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', userId)
		.gte('recorded_at', `${sd}T00:00:00Z`)
		.lte('recorded_at', `${ed}T23:59:59Z`);

	if (error) return 0;
	return count ?? 0;
}

/**
 * Permanently delete points by their recorded_at timestamps.
 * Deletes in batches of 500 to avoid URL length limits.
 */
export async function deletePoints(userId: string, timestamps: string[]): Promise<number> {
	let deleted = 0;
	const batchSize = 500;

	for (let i = 0; i < timestamps.length; i += batchSize) {
		const batch = timestamps.slice(i, i + batchSize);
		const { error } = await fluxbase
			.from('tracker_data')
			.delete()
			.eq('user_id', userId)
			.in('recorded_at', batch);

		if (error) {
			console.error('[deletePoints] batch error:', error);
			throw new Error(error.message);
		}
		deleted += batch.length;
	}

	return deleted;
}

/**
 * Get exclusion zones from user_preferences.
 */
export async function getExclusionZones(): Promise<ExclusionZone[]> {
	const { data: userData } = await fluxbase.auth.getUser();
	const userId = userData?.user?.id;
	if (!userId) return [];

	const { data } = await fluxbase
		.from<Record<string, any>>('user_preferences')
		.select('trip_exclusions')
		.eq('id', userId)
		.maybeSingle();

	const exclusions = (data as any)?.trip_exclusions;
	if (!Array.isArray(exclusions)) return [];

	return exclusions
		.filter((e: any) => e?.location?.lat && e?.location?.lng)
		.map((e: any) => ({
			name: e.name || 'Unknown',
			location: { lat: e.location.lat, lng: e.location.lng },
			radius: e.radius || 500
		}));
}

/**
 * Get home address from user_profiles.
 */
export async function getHomeAddress(): Promise<{ lat: number; lng: number } | null> {
	const { data: userData } = await fluxbase.auth.getUser();
	const userId = userData?.user?.id;
	if (!userId) return null;

	const { data } = await fluxbase
		.from<Record<string, any>>('user_profiles')
		.select('home_address')
		.eq('id', userId)
		.maybeSingle();

	const addr = (data as any)?.home_address;
	if (!addr) return null;

	if (typeof addr === 'string') {
		try {
			const parsed = JSON.parse(addr);
			if (parsed?.lat && parsed?.lng) return { lat: parsed.lat, lng: parsed.lng };
		} catch {
			return null;
		}
	} else if (addr?.lat && addr?.lng) {
		return { lat: addr.lat, lng: addr.lng };
	}

	return null;
}
