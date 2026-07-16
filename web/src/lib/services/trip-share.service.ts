import { fluxbase } from '$lib/fluxbase';
import { fetchTrackPoints } from '$lib/services/gps.service';

export type TripShare = {
	id: string;
	trip_id: string;
	shared_with_user_id: string;
	role: string;
	created_at: string;
	username?: string;
	avatar_url?: string | null;
};

export async function getTripShares(tripId: string): Promise<TripShare[]> {
	const { data, error } = await fluxbase
		.from('trip_shares')
		.select('*')
		.eq('trip_id', tripId)
		.order('created_at', { ascending: false });

	if (error || !data) return [];

	// Fetch profiles
	const userIds = (data as any[]).map((s) => s.shared_with_user_id);
	if (userIds.length === 0) return [];

	const { data: profiles } = await fluxbase
		.from('public_profiles')
		.select('id, username, avatar_url')
		.in('id', userIds);

	const profileMap = new Map<string, any>();
	for (const p of (profiles as any[]) ?? []) {
		profileMap.set(p.id, p);
	}

	return (data as any[]).map((s) => ({
		...s,
		username: profileMap.get(s.shared_with_user_id)?.username,
		avatar_url: profileMap.get(s.shared_with_user_id)?.avatar_url
	}));
}

export async function shareTrip(
	tripId: string,
	userId: string,
	role: string = 'viewer'
): Promise<void> {
	const { error } = await fluxbase.from('trip_shares').insert({
		trip_id: tripId,
		shared_with_user_id: userId,
		role
	});
	if (error) throw new Error(error.message);
}

export async function unshareTrip(tripId: string, userId: string): Promise<void> {
	const { error } = await fluxbase
		.from('trip_shares')
		.delete()
		.eq('trip_id', tripId)
		.eq('shared_with_user_id', userId);
	if (error) throw new Error(error.message);
}

export async function updateShareRole(tripId: string, userId: string, role: string): Promise<void> {
	const { error } = await fluxbase
		.from('trip_shares')
		.update({ role })
		.eq('trip_id', tripId)
		.eq('shared_with_user_id', userId);
	if (error) throw new Error(error.message);
}

export async function getSharedTrips(userId: string): Promise<string[]> {
	const { data, error } = await fluxbase
		.from('trip_shares')
		.select('trip_id')
		.eq('shared_with_user_id', userId);

	if (error || !data) return [];
	return (data as any[]).map((s) => s.trip_id);
}

/**
 * Pre-compute a GPS track and store it in trip_gps_tracks.
 * Called when gps_visible_to changes from 'private' to 'friends' or 'public'.
 */
export async function generateGpsTrack(
	userId: string,
	tripId: string,
	startDate: string,
	endDate: string
): Promise<void> {
	const points = await fetchTrackPoints(userId, startDate, endDate, 500);

	const { error } = await fluxbase.from('trip_gps_tracks').upsert(
		{
			trip_id: tripId,
			user_id: userId,
			points: JSON.stringify(points.map((p) => ({ lat: p.lat, lng: p.lng, date: p.date })))
		},
		{ onConflict: 'trip_id' }
	);

	if (error) throw new Error(error.message);
}

export async function getGpsTrack(
	tripId: string
): Promise<Array<{ lat: number; lng: number; date: string }> | null> {
	const { data, error } = await fluxbase
		.from('trip_gps_tracks')
		.select('points')
		.eq('trip_id', tripId)
		.limit(1)
		.maybeSingle();

	if (error || !data) return null;

	const points = (data as any).points;
	if (typeof points === 'string') {
		try {
			return JSON.parse(points);
		} catch {
			return null;
		}
	}
	return Array.isArray(points) ? points : null;
}
