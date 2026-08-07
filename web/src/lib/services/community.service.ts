/**
 * Community service — shared query logic for the travelers directory and
 * stories feed. Used by the landing page and the dedicated /travelers and
 * /stories browse pages so the query/enrichment logic isn't duplicated.
 *
 * All queries are RLS-scoped: anonymous callers see only public rows;
 * authenticated callers see public + their own + shared. The discoverability
 * of each traveler is checked via the server-side is_discoverable_to()
 * function (respects everyone / friends_of_friends / nobody).
 */

import { fluxbase } from '$lib/fluxbase';

export interface CommunityTraveler {
	id: string;
	username: string;
	full_name: string | null;
	avatar_url: string | null;
	trip_count: number;
}

export interface CommunityStory {
	id: string;
	trip_id: string;
	title: string;
	body: string;
	entry_date: string;
	trip_title?: string;
	trip_image_url?: string | null;
	username?: string;
}

export interface CommunityTrip {
	id: string;
	title: string;
	image_url: string | null;
	start_date: string;
	status: string;
	visibility: string;
}

/**
 * Load discoverable travelers with their visible-trip counts.
 * @param currentUserId  The caller's user id (null for anonymous).
 * @param limit          Max travelers to return.
 */
export async function loadTravelers(
	currentUserId: string | null,
	limit = 24
): Promise<CommunityTraveler[]> {
	// Seed from trips the caller can see (RLS-scoped), then enrich with profiles.
	const { data: tripsData, error: tripsError } = await fluxbase
		.from('trips')
		.select('user_id')
		.in('status', ['active', 'completed', 'planned'])
		.order('start_date', { ascending: false })
		.limit(200);
	if (tripsError) console.warn('[community] travelers trips query error:', tripsError);

	const userIds = [...new Set(((tripsData as any[]) ?? []).map((t) => t.user_id))];
	if (userIds.length === 0) return [];

	// Count each user's visible trips.
	const { data: tripCounts } = await fluxbase
		.from('trips')
		.select('user_id')
		.in('user_id', userIds);
	const countMap = new Map<string, number>();
	for (const tr of (tripCounts as any[]) ?? [])
		countMap.set(tr.user_id, (countMap.get(tr.user_id) ?? 0) + 1);

	const { data: profiles } = await fluxbase
		.from('public_profiles')
		.select('id, username, full_name, avatar_url, discoverable')
		.in('id', userIds);

	const candidateProfiles = (profiles as any[]) ?? [];

	// Filter by discoverability via the server-side function (falls back to a
	// simple '!= nobody' client filter if the function isn't deployed).
	let visible: any[];
	try {
		const checks = await Promise.all(
			candidateProfiles.map((p) =>
				fluxbase
					.rpc('is_discoverable_to', { target_user: p.id })
					.then((r: any) => ({ p, ok: !!r?.data }))
					.catch(() => ({ p, ok: null }))
			)
		);
		const serverAnswered = checks.some((c) => c.ok !== null);
		visible = checks
			.filter((c) =>
				serverAnswered ? c.ok === true : (c.p.discoverable ?? 'everyone') !== 'nobody'
			)
			.map((c) => c.p);
	} catch {
		visible = candidateProfiles.filter((p) => (p.discoverable ?? 'everyone') !== 'nobody');
	}

	return visible
		.map((p) => {
			const { discoverable: _d, ...rest } = p as any;
			return { ...rest, trip_count: countMap.get(p.id) ?? 0 };
		})
		.filter((p) => p.trip_count > 0)
		.sort((a, b) => b.trip_count - a.trip_count)
		.slice(0, limit);
}

/**
 * Load public/community stories (published trip entries), including the signed-
 * in user's own entries. @param currentUserId null for anonymous (public only).
 */
export async function loadStories(
	currentUserId: string | null,
	limit = 12,
	offset = 0
): Promise<{ stories: CommunityStory[]; hasMore: boolean }> {
	// Community trips: RLS returns public + owned + shared.
	const { data: tripsData, error: tripsError } = await fluxbase
		.from('trips')
		.select('id, title, image_url, user_id, metadata')
		.in('status', ['active', 'completed', 'planned'])
		.order('start_date', { ascending: false })
		.limit(50);
	if (tripsError) console.warn('[community] stories trips query error:', tripsError);

	const tripsList = (tripsData as any[]) ?? [];

	// Always also fetch the signed-in user's own trips so their entries appear.
	let ownTrips: any[] = [];
	if (currentUserId) {
		try {
			const { data: ownData } = await fluxbase
				.from('trips')
				.select('id, title, image_url, user_id, metadata')
				.eq('user_id', currentUserId)
				.in('status', ['active', 'completed', 'planned'])
				.order('start_date', { ascending: false })
				.limit(50);
			ownTrips = (ownData as any[]) ?? [];
		} catch (err) {
			console.warn('[community] own-trips query failed:', err);
		}
	}

	const tripMap = new Map<string, any>();
	for (const tr of [...tripsList, ...ownTrips]) tripMap.set(tr.id, tr);
	const allTripIds = [...tripMap.keys()];
	if (allTripIds.length === 0) return [];

	// Request limit+1 rows from the offset — the extra row is a "has more"
	// sentinel. PostgREST .range() is inclusive on both ends.
	const [entriesResult, profilesResult, mediaResult] = await Promise.all([
		fluxbase
			.from('trip_entries')
			.select('id, trip_id, title, body, entry_date, cover_media_id, status')
			.in('trip_id', allTripIds)
			.order('entry_date', { ascending: false })
			.range(offset, offset + limit),
		fluxbase
			.from('public_profiles')
			.select('id, username')
			.in('id', [...new Set(allTripIds.map((id) => tripMap.get(id)!.user_id))]),
		fluxbase.from('trip_media').select('id, storage_path, thumbnail_path').in('trip_id', allTripIds)
	]);

	if (entriesResult.error) console.warn('[community] entries query error:', entriesResult.error);

	const profileMap = new Map<string, string>();
	for (const p of (profilesResult.data as any[]) ?? []) profileMap.set(p.id, p.username);
	const mediaMap = new Map<string, string>();
	for (const m of (mediaResult.data as any[]) ?? [])
		mediaMap.set(m.id, m.thumbnail_path ?? m.storage_path);

	const entriesList = ((entriesResult.data as any[]) ?? []).filter((e) => e.status === 'published');

	const seenEntry = new Set<string>();
	const deduped = entriesList.filter((e) => {
		if (seenEntry.has(e.id)) return false;
		seenEntry.add(e.id);
		return true;
	});

	// If we got more than `limit` rows, there's another page.
	const hasMore = deduped.length > limit;
	const page = deduped.slice(0, limit);

	return {
		stories: page.map((e) => {
			const trip = tripMap.get(e.trip_id);
			const entryCover = e.cover_media_id ? mediaMap.get(e.cover_media_id) : null;
			return {
				id: e.id,
				trip_id: e.trip_id,
				title: e.title,
				body: e.body,
				entry_date: e.entry_date,
				trip_title: trip?.title,
				trip_image_url: entryCover ?? trip?.image_url,
				username: trip ? profileMap.get(trip.user_id) : undefined
			};
		}),
		hasMore
	};
}

/**
 * Load the signed-in user's own trips for the "Your trips" section.
 */
export async function loadOwnTrips(userId: string, limit = 6): Promise<CommunityTrip[]> {
	let rows: any[] = [];
	try {
		const { data, error } = await fluxbase
			.from('trips')
			.select('id, title, image_url, start_date, status, visibility')
			.eq('user_id', userId)
			.in('status', ['active', 'completed', 'planned'])
			.order('start_date', { ascending: false })
			.limit(limit);
		if (error) console.warn('[community] own-trips query error:', error);
		rows = (data as any[]) ?? [];
	} catch (err) {
		console.warn('[community] own-trips query failed:', err);
	}
	return rows;
}
